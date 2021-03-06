const { execSync: execSyncNoLogging } = require('child_process');
const {
  performance: { now },
} = require('perf_hooks');
const internetAvailable = require('internet-available');

const outputShellResult = (preamble, buffer) => {

  const trimmedBuffer = buffer ? buffer.toString().trim() : '';

  if (!trimmedBuffer) {
    return '';
  }

  if (trimmedBuffer.split('\n').length>2) {
    console.log(`======================= ${preamble}`);
    console.log(trimmedBuffer);
    console.log(`======================= /${preamble}`);
  } else {
    console.log(`${preamble}: ${trimmedBuffer}`);
  }
  return trimmedBuffer;
};

const sleep = async ms => new Promise(r => setTimeout(r, ms));

const execSync = (cmd, opts = { bubbleError: false, noop: false }) => {
  console.log(`Running [${cmd}]`);
  try {
    const buffer = !opts.noop ? execSyncNoLogging(cmd) : '';
    return outputShellResult('Success', buffer);
  } catch (err) {
    const buffer = err.stderr;
    const result = outputShellResult(`Failed: code [${err.status}]`, buffer);

    if (opts.bubbleError) {
      throw err;
    }
    return result;
  }
};

const benchmark = (fn) => {
  const t0 = now();
  const output = fn();

  const hasSomethingWorthLogging = (output || typeof output === 'object' && output.length);

  if(!hasSomethingWorthLogging){
    return;
  }

  const elapsedTimeMs = now() - t0;
  console.log(`Took ${elapsedTimeMs} milliseconds`);
  return elapsedTimeMs;
};

const isOnline = async () => {
  try {
    await internetAvailable();
    return true;
  } catch (err) {
    console.log(err.toString());
    return false;
  }
};

module.exports = { sleep, execSync, benchmark, isOnline };
