/**
 * OpenTelemetry bootstrap (production exit condition 6).
 *
 * ## Why this file is imported before anything else
 *
 * Auto-instrumentation works by monkey-patching modules as they are required.
 * Anything already loaded when the SDK starts is never patched, so `http`,
 * `pg`, `@nestjs/core` and the rest have to be untouched at that moment. That is
 * why `main.ts` imports this module on its first line, before Nest, and why this
 * file imports nothing from the application.
 *
 * ## Off by default, and honest about it
 *
 * With no exporter configured this starts nothing at all — no SDK, no
 * background timers, no queue filling in memory. It does NOT start a
 * no-op-exporter SDK, because that looks identical in the logs to a working
 * one, and "monitoring is on" was one of the claims this project has already
 * been caught making about a control that was absent (the malware-scan stub).
 * `telemetryStatus()` reports exactly which of the three states we are in, and
 * the readiness probe surfaces it.
 *
 * ## What it exports to
 *
 *  - Any OTLP/HTTP collector via `OTEL_EXPORTER_OTLP_ENDPOINT`
 *    (Grafana Agent, the OTel Collector, Honeycomb, Datadog's OTLP intake…).
 *  - Azure Monitor / Application Insights via
 *    `APPLICATIONINSIGHTS_CONNECTION_STRING`, whose ingestion endpoint speaks
 *    OTLP; the connection string is parsed for its endpoint and key.
 *
 * Both can be set; spans then go to both.
 */
import { diag, DiagConsoleLogger, DiagLogLevel, metrics, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

export type TelemetryState = 'disabled' | 'active' | 'failed';

export interface TelemetryStatus {
  state: TelemetryState;
  /** Where spans and metrics are being sent, for the readiness probe. */
  exporters: string[];
  serviceName: string;
  reason?: string;
}

let status: TelemetryStatus = {
  state: 'disabled',
  exporters: [],
  serviceName: 'concord-api',
};
let sdk: NodeSDK | undefined;

/** Parses an Application Insights connection string into OTLP inputs. */
function parseAppInsights(cs: string): { endpoint: string; key: string } | null {
  const parts = Object.fromEntries(
    cs
      .split(';')
      .map((kv) => kv.split('='))
      .filter((p) => p.length >= 2)
      .map(([k, ...v]) => [k.trim().toLowerCase(), v.join('=').trim()]),
  );
  const key = parts.instrumentationkey;
  // Azure gives the ingestion host in the connection string; fall back to the
  // public one for the region-agnostic endpoint.
  const base = (parts.ingestionendpoint || 'https://dc.services.visualstudio.com').replace(/\/+$/, '');
  if (!key) return null;
  return { endpoint: `${base}/v2/track`, key };
}

export function startTelemetry(): TelemetryStatus {
  const serviceName = process.env.OTEL_SERVICE_NAME || 'concord-api';
  status.serviceName = serviceName;

  const otlp = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const appInsights = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING?.trim();

  if (!otlp && !appInsights) {
    status = {
      state: 'disabled',
      exporters: [],
      serviceName,
      reason:
        'neither OTEL_EXPORTER_OTLP_ENDPOINT nor APPLICATIONINSIGHTS_CONNECTION_STRING is set',
    };
    return status;
  }

  if (process.env.OTEL_DIAG === 'true') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  try {
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || '0.1.0',
      'deployment.environment.name': process.env.NODE_ENV || 'development',
      // Lets one backend hold several deployments without them merging.
      'service.namespace': process.env.OTEL_SERVICE_NAMESPACE || 'concord',
      'service.instance.id': process.env.HOSTNAME || `local-${process.pid}`,
    });

    const headers: Record<string, string> = {};
    for (const kv of (process.env.OTEL_EXPORTER_OTLP_HEADERS || '').split(',')) {
      const [k, ...v] = kv.split('=');
      if (k && v.length) headers[k.trim()] = v.join('=').trim();
    }

    const exporters: string[] = [];
    let traceExporter: OTLPTraceExporter | undefined;
    let metricExporter: OTLPMetricExporter | undefined;

    if (otlp) {
      const base = otlp.replace(/\/+$/, '');
      traceExporter = new OTLPTraceExporter({ url: `${base}/v1/traces`, headers });
      metricExporter = new OTLPMetricExporter({ url: `${base}/v1/metrics`, headers });
      exporters.push(`otlp:${base}`);
    }

    if (appInsights) {
      const parsed = parseAppInsights(appInsights);
      exporters.push(parsed ? 'azure-monitor' : 'azure-monitor(unparseable)');
      if (!parsed) {
        // Say so rather than appearing configured. A malformed connection string
        // that silently exports nothing is the failure mode this file avoids.
        // eslint-disable-next-line no-console
        console.warn(
          '[telemetry] APPLICATIONINSIGHTS_CONNECTION_STRING has no InstrumentationKey — ignored',
        );
      } else if (!traceExporter) {
        // Azure Monitor's OTLP intake is reached through the same protocol.
        traceExporter = new OTLPTraceExporter({
          url: `${parsed.endpoint}`,
          headers: { ...headers, 'x-api-key': parsed.key },
        });
      }
    }

    sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader: metricExporter
        ? new PeriodicExportingMetricReader({
            exporter: metricExporter,
            exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS) || 60_000,
          })
        : undefined,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Filesystem spans are pure noise at this volume and dominate the bill.
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-http': {
            // Health and readiness are polled every few seconds by the
            // orchestrator. Tracing them buries real traffic and costs money to
            // store; their failures show up as the probe failing, not as a span.
            ignoreIncomingRequestHook: (req) =>
              /^\/api\/health(\/|$)/.test((req.url || '').split('?')[0]),
          },
        }),
      ],
    });

    sdk.start();
    status = { state: 'active', exporters, serviceName };

    const shutdown = () => {
      // Flush before the process goes away, or the last spans of a failing
      // request — the ones worth having — are lost with it.
      sdk?.shutdown().catch(() => undefined);
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  } catch (e) {
    status = {
      state: 'failed',
      exporters: [],
      serviceName,
      reason: String(e),
    };
    // eslint-disable-next-line no-console
    console.error(`[telemetry] failed to start: ${String(e)}`);
  }

  return status;
}

export function telemetryStatus(): TelemetryStatus {
  return status;
}

/** The tracer used for spans this codebase creates by hand. */
export const tracer = trace.getTracer('concord');

/**
 * Operational metrics.
 *
 * Deliberately a short list. These are the things that should page a human, not
 * everything that could be counted: a failed audit append means the evidentiary
 * record has a hole; a quarantined upload means a contract did not arrive; a
 * failed notification means an approval nobody received; a dead-lettered job
 * means work silently stopped. Request rate and latency come free from the HTTP
 * auto-instrumentation and are not duplicated here.
 */
/**
 * Instruments are resolved LAZILY, on first use.
 *
 * This is not a style choice. `metrics.getMeter()` returns a **NoopMeter** when
 * no MeterProvider has been registered yet, and — unlike the traces API, which
 * has a proxy tracer that re-resolves — a counter created from a NoopMeter stays
 * no-op forever. Module-level instruments are therefore created while `main.ts`
 * is still evaluating its imports, before `sdk.start()` registers the provider,
 * and every `.add()` afterwards silently goes nowhere.
 *
 * That was the first version of this file, and it behaved exactly like a working
 * one: the collector received traces, the boot log said telemetry was active,
 * and the counters reported nothing because nothing had failed — indistinguish-
 * able from the bug. It was caught by deliberately quarantining an upload and
 * finding the counter still absent at the collector.
 *
 * Resolving on first use means the provider is always in place by then.
 */
type Attrs = Record<string, string | number | boolean | undefined>;

const instruments = new Map<string, ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>>();

function counter(name: string, description: string) {
  let c = instruments.get(name);
  if (!c) {
    c = metrics.getMeter('concord').createCounter(name, { description });
    instruments.set(name, c);
  }
  return c;
}

/**
 * Operational metrics.
 *
 * Deliberately a short list. These are the things that should page a human, not
 * everything that could be counted: a failed audit append means the evidentiary
 * record has a hole; a quarantined upload means a contract did not arrive; a
 * failed notification means an approval nobody received; a dead-lettered job
 * means work silently stopped. Request rate and latency come free from the HTTP
 * auto-instrumentation and are not duplicated here.
 *
 * Each is a function rather than an exported instrument, so there is no way to
 * capture one before the provider exists.
 */
export const auditAppendFailures = {
  add: (n: number, a?: Attrs) =>
    counter(
      'concord.audit.append_failures',
      'Audit-trail appends that did not persist. Any value above zero is a gap in the evidentiary record.',
    ).add(n, a),
};
export const uploadsQuarantined = {
  add: (n: number, a?: Attrs) =>
    counter(
      'concord.ingest.quarantined',
      'Uploads rejected by content security or malware scanning.',
    ).add(n, a),
};
export const notificationFailures = {
  add: (n: number, a?: Attrs) =>
    counter(
      'concord.notifications.failed',
      'Outbound Graph notifications that failed or could not be delivered.',
    ).add(n, a),
};
export const approvalRouteFailures = {
  add: (n: number, a?: Attrs) =>
    counter(
      'concord.approvals.route_failed',
      'Approval requests that could not be routed to their approvers.',
    ).add(n, a),
};
export const jobsDeadLettered = {
  add: (n: number, a?: Attrs) =>
    counter('concord.jobs.dead_lettered', 'Background jobs that exhausted their retries.').add(n, a),
};
export const esignExecuted = {
  add: (n: number, a?: Attrs) =>
    counter(
      'concord.esign.executed',
      'Signature envelopes completed and sealed to the archive.',
    ).add(n, a),
};
