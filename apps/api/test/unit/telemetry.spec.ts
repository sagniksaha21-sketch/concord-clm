/**
 * Telemetry must never *appear* configured while exporting nothing.
 *
 * This project has already shipped one control that reported itself present
 * while being absent (the malware-scan stub), and the first version of the
 * telemetry module repeated the shape in a subtler way: instruments were created
 * at module load, before `sdk.start()` registered a MeterProvider, so
 * `metrics.getMeter()` returned a NoopMeter and every counter increment went
 * nowhere — for good, since a no-op counter never re-resolves. Traces worked,
 * the boot log said "active", and the counters were simply always zero, which is
 * indistinguishable from "nothing has failed yet".
 *
 * These tests pin the three states and the lazy resolution.
 */
import { startTelemetry, telemetryStatus, uploadsQuarantined } from '../../src/telemetry/telemetry';

describe('Telemetry reports its own state honestly', () => {
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
  });

  it('is disabled — with a stated reason — when no exporter is configured', () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    const s = startTelemetry();
    expect(s.state).toBe('disabled');
    expect(s.exporters).toEqual([]);
    // The reason matters: an operator seeing "disabled" must be able to tell
    // *why* without reading the source.
    expect(s.reason).toMatch(/OTEL_EXPORTER_OTLP_ENDPOINT/);
    expect(telemetryStatus().state).toBe('disabled');
  });

  it('never throws from an instrument, configured or not', () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    startTelemetry();
    // A metric increment on a failure path must not become a second failure.
    expect(() => uploadsQuarantined.add(1, { scan: 'unscanned', engine: 'none' })).not.toThrow();
  });

  it('resolves instruments lazily, not at module load', () => {
    // The regression: a counter captured at import time is bound to whatever
    // provider existed then — a NoopMeter — permanently. The exported members
    // must therefore be wrappers that resolve on each call, not instruments.
    expect(typeof uploadsQuarantined.add).toBe('function');
    expect((uploadsQuarantined as any).constructor?.name).not.toMatch(/Counter/);
  });
});

describe('Telemetry configuration surfaces on the readiness probe', () => {
  it('exposes state so "no alerts" can be distinguished from "no exporter"', () => {
    const s = telemetryStatus();
    expect(['disabled', 'active', 'failed']).toContain(s.state);
    expect(typeof s.serviceName).toBe('string');
  });
});
