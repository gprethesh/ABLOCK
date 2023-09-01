const CronJob = require("cron").CronJob;
const chalk = require("chalk");

// Function to get the block's hash
function getBlockHash(block) {
  // Replace with your implementation to get the block's hash
  return block.hash;
}

// Function to add a block to the blockchain
async function addBlockToChain(block) {
  // Replace with your implementation to add the block to the blockchain
  return true; // Return true if the block is added successfully, false otherwise
}

// Set ENABLE_CHAIN_REQUEST to true to enable chain request
const ENABLE_CHAIN_REQUEST = true;

// Object to store chain information
const chainInfo = {
  checkedBlock: {},
};

// Object to store mining state
const miningState = {
  isMining: true,
};

// Function to start the mining process
async function startMiningProcess() {
  // Mining process code here
}

// Start the mining process based on the cron job
const job = new CronJob("*/60 * * * * *", async function () {
  if (miningState.isMining) {
    await startMiningProcess();
  }
});
job.start();

// Function to handle received messages
async function handleMessage(message) {
  switch (message.type) {
    case MessageType.GET_NEW_BLOCK:
      if (ENABLE_CHAIN_REQUEST == true) {
        if (message.data.sender !== keyPair.publicKey.toString("hex")) {
          console.log("-----------RECEIVED_NEW_BLOCK-------------");

          // Check if the block is new
          const blockHash = getBlockHash(message.data.block);
          if (!chainInfo.checkedBlock[blockHash]) {
            // Add to blockchain
            const newBlock = await addBlockToChain(message.data.block);
            if (newBlock) {
              console.log(
                chalk.red.bold(
                  `OPPONENT GOT REWARD - ADDING THEIR BLOCK TO CHAIN`
                )
              );
              // Stop any ongoing mining process
              miningState.isMining = false;

              // Add the block's hash to chainInfo.checkedBlock
              chainInfo.checkedBlock[blockHash] = true;
              console.log("CHAIN-INFO::", chainInfo.checkedBlock);
            } else {
              console.log(
                chalk.green.bold(
                  `BLOCK SENT BY OPPONENT WAS INVALID - SO I WON`
                )
              );
            }
          } else {
            console.log(
              `chainInfo.checkedBlock[blockHash]`,
              chainInfo.checkedBlock[blockHash]
            );
          }

          console.log("-----------RECEIVED_NEW_BLOCK-------------");
        }
      }

      break;
    // Handle other message types
  }
}

module.exports = {
  handleMessage,
};