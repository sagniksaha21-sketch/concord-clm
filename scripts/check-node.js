#!/usr/bin/env node
/**
 * Fails the build unless the Node.js major version is 22, preventing runtime
 * drift between developer machines, CI, Docker build stages and production
 * (GPT 5.6 P0: Node.js runtime consistency).
 */
const REQUIRED_MAJOR = 22;
const major = Number(process.versions.node.split('.')[0]);
if (major !== REQUIRED_MAJOR) {
  console.error(
    `\n[check:node] Node.js ${REQUIRED_MAJOR}.x is required — found ${process.versions.node}.\n` +
      `Use the pinned runtime (see .nvmrc): 'nvm use' or install Node ${REQUIRED_MAJOR}.\n`,
  );
  process.exit(1);
}
console.log(`[check:node] OK — Node.js ${process.versions.node}`);
