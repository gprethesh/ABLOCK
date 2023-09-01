const { parentPort } = require('worker_threads');
const { mineBlock, calculateHashForBlock } = require('./chain.js');

parentPort.on('message', async (block) => {
  const minedBlock = await mineBlock(block);
  parentPort.postMessage(minedBlock);
});