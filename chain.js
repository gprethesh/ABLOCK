const crypto = require("crypto");
const Block = require("./block.js").Block;
const BlockHeader = require("./block.js").BlockHeader;
const Transaction = require("./block.js").Transaction;
const MerkleTree = require("./merkleTree.js");
const AsyncLock = require("async-lock");
const EC = require("elliptic").ec,
  ec = new EC("secp256k1");
const { Level } = require("level");
const fs = require("fs");
const path = require("path");
const levelup = require("levelup");
const leveldown = require("leveldown");
const chalk = require("chalk");
const miningState = require("./miningState");
const util = require("util");
const scryptAsync = util.promisify(crypto.scrypt);

const { TRANSACTION_FEE, MINING_REWARD, MAX_SUPPLY } = require("./config.json");
const tp = require("./transactionPool");

const difficulty = 0x10;
const maximumTarget = BigInt(
  "0x000FFFFFFFFF0000000000000000000000000000000000000000000000000000"
);
const target = maximumTarget / BigInt(difficulty);

const blockchain = [];
const lock = new AsyncLock();

let db;

let createDb = async (peerId) => {
  let dir = path.join(__dirname, "db", peerId);
  try {
    await fs.promises.access(dir, fs.constants.F_OK);
    // If the code reaches here, it means that the directory exists.
    let levelDb = leveldown(dir);
    db = levelup(levelDb);
  } catch (err) {
    if (err.code === "ENOENT") {
      // If the directory does not exist, create it.
      await fs.promises.mkdir(dir, { recursive: true });
      let levelDb = leveldown(dir);
      db = levelup(levelDb);
      let genesisBlock = await createGenesisBlock();
      blockchain.push(genesisBlock);
      storeBlock(genesisBlock);
      console.log(`Genesis Block Created.`, genesisBlock);
    } else {
      // Some other error occurred.
      console.error("Error creating or opening database:", err);
    }
  }
};

async function calculateHashForBlock(block) {
  const data = [
    block.blockHeader.version,
    block.blockHeader.previousBlockHeader,
    block.blockHeader.merkleRoot,
    block.blockHeader.time,
    block.nonce,
  ].join("");

  const salt = "someConstantSalt"; // Generate a random salt
  const keylen = 32; // Length of the output key

  // Adjust these for CPU-friendly mining
  const N = 1024; // Lower CPU/memory cost factor
  const r = 4; // Lower block size
  const p = 1; // Lower parallelization factor

  try {
    const derivedKey = await scryptAsync(data, salt, keylen, { N, r, p });
    return derivedKey.toString("hex");
  } catch (err) {
    throw err; // Handle the error as you see fit
  }
}

async function createGenesisBlock() {
  let timestamp = 1690365924213;
  let previousBlockHeader =
    "0000000000000000000000000000000000000000000000000000000000000000";
  let version = "1.0.0";
  let merkleRoot =
    "bb77e380f6d0ae7a842dc47a11b4d6a46523b05295eb86d4a583e59b90c1cbb5";
  let blockHeader = new BlockHeader(
    version,
    previousBlockHeader,
    merkleRoot,
    timestamp
  );

  // Create a transaction
  let sender = "genesis";
  let receiver =
    "04227ea4320cfd7d50fd821b3cc66d7bcbd80a8806dc3e5ce90fba3c6594920c482d6360933fd149363d5d1177320e108d836165ae48ece6d9c54919565c2f0562";
  let amount = 100000;
  let transaction = new Transaction(sender, receiver, amount);

  // Add the transaction to the block
  let transactions = [transaction];

  let index = 0;
  let block = new Block(blockHeader, index, transactions);
  block.blockHeader.hash = await calculateHashForBlock(block);

  await updateBalance(receiver, amount);

  return block;
}

async function mineBlock(block) {
  console.log("target", target.toString());
  let hash = await calculateHashForBlock(block);
  console.log("Mining for hash", hash);
  while (BigInt("0x" + hash) > target) {
    block.nonce++;
    hash = await calculateHashForBlock(block);
  }

  block.blockHeader.difficulty = "0x" + difficulty.toString(16); // Difficulty as hexadecimal
  block.target = target.toString();
  block.blockHeader.hash = hash;
  return block;
}

async function rewardMiner(block) {
  try {
    // Check that the first transaction is from 'coinbase'
    if (block.transactions[0].sender !== "coinbase") {
      throw new Error("First transaction is not from 'coinbase'");
    }

    let minerAddress = block.transactions[0].receiver;

    // Fetch and wait for the miner's balance
    let minerBalance = await getBalance(minerAddress);
    minerBalance = minerBalance || 0;

    let totalTransactionFees = 0;

    // Start i at 1 to skip the coinbase transaction
    for (let i = 1; i < block.transactions.length; i++) {
      totalTransactionFees += block.transactions[i].fee;
    }

    // Update and wait for the miner's balance to be updated
    await updateBalance(
      minerAddress,
      minerBalance + totalTransactionFees + MINING_REWARD
    );
  } catch (error) {
    console.error(`Failed to reward miner: ${error.message}`);
  }
}

async function createNewBlock(transactions, minerAddress) {
  let userTransactions = [...transactions]; // Copy the original transactions first

  let tx = userTransactions.filter(
    (transaction) =>
      transaction.sender !== "coinbase" && transaction.sender !== "system"
  );

  let blockHeader = await createNewBlockHeader(transactions);
  let index = (await getBlockHeight()) + 1;
  console.log(`INDEX`, index);

  // Use blockTransactions for the transactions of newBlock
  // And use tx for the tx field of newBlock
  let newBlock = new Block(blockHeader, index, transactions, tx);

  return newBlock;
}

// TODO

async function createNewBlockHeader(transactions) {
  let timestamp = new Date().getTime();
  let version = "1.0.0";
  let previousBlockHeader = await getPreviousBlockHeader();

  let merkleTree = new MerkleTree(transactions);
  let merkleRoot = merkleTree.getMerkleRoot();
  let difficulty = await updateDifficulty();
  console.log(`difficulty`, difficulty);
  return new BlockHeader(
    version,
    previousBlockHeader,
    merkleRoot,
    timestamp,
    difficulty
  );
}

async function getPreviousBlockHeader() {
  console.log(`i'm called getPreviousBlockHeader`);
  // Get the total count of blocks in your blockchain
  let totalBlocks = await getBlockHeight();

  let previousBlockHeader = null;

  if (totalBlocks > 0) {
    // if blocks exist, get the last block's hash
    previousBlockHeader = (await getBlockFromLevelDB(totalBlocks)).blockHeader
      .hash;
    console.log(`totalblocks greater so this was called`);
  } else if (totalBlocks === 0) {
    // if no blocks exist yet (other than genesis), get the genesis block's hash
    previousBlockHeader = (await getBlockFromLevelDB(0)).blockHeader.hash;
    console.log(`no blocks so this was called`);
  } else {
    // handle error case if totalBlocks is less than 0
    throw new Error("Invalid block count");
  }

  return previousBlockHeader;
}

async function updateDifficulty() {
  console.log(`called function`);
  const targetBlockTime = 20000; // Target time per block in milliseconds
  const TARGET_BLOCK_INTERVAL = 2; // Number of blocks for difficulty adjustment

  // Add a default difficulty value for the first block.
  let defaultDifficulty = difficulty;

  let blockHeight = await getBlockHeight();

  console.log(`blockHeight`, blockHeight);

  // If there are no blocks in the blockchain, return the default difficulty.
  if (blockHeight === 0) {
    console.log(`return because no block ?`);
    return defaultDifficulty;
  }

  if (
    blockHeight < TARGET_BLOCK_INTERVAL ||
    blockHeight % TARGET_BLOCK_INTERVAL !== 0
  ) {
    console.log(`inside the block`);
    let lastBlock = await getBlockFromLevelDB(blockHeight - 1);

    return lastBlock.blockHeader.difficulty;
  }

  let oldBlock = await getBlockFromLevelDB(blockHeight - TARGET_BLOCK_INTERVAL);
  let lastBlock = await getBlockFromLevelDB(blockHeight - 1);

  let timeDifference = lastBlock.blockHeader.time - oldBlock.blockHeader.time;
  console.log(`timeDifference`, timeDifference);

  // Calculate the new difficulty
  let newDifficulty = lastBlock.blockHeader.difficulty;
  let idealTime = targetBlockTime * TARGET_BLOCK_INTERVAL;
  let ratio = idealTime / timeDifference;

  newDifficulty = Math.round(newDifficulty * ratio);

  console.log(`newDifficulty`, newDifficulty);

  // Convert newDifficulty to hexadecimal
  let newDifficultyHex = "0x" + newDifficulty.toString(16);

  console.log(`newDifficulty in hexadecimal`, newDifficultyHex);

  return newDifficultyHex;
}

async function isValidNewBlock(newBlock, previousBlock) {
  if (!previousBlock) {
    // This is the first block. Perform specific genesis block checks.
    // For simplicity, we'll only check the index here.
    if (newBlock.index !== 0) {
      console.log("Error: The first block's index must be 0");
      return false;
    }
  } else {
    // This is not the first block. Perform regular checks.
    if (previousBlock.index + 1 !== newBlock.index) {
      console.log("Error: Invalid index");
      return false;
    } else if (
      previousBlock.blockHeader.hash !==
      newBlock.blockHeader.previousBlockHeader
    ) {
      console.log("Error: Invalid previous block header");
      return false;
    } else {
      let hash = await calculateHashForBlock(newBlock);
      if (hash !== newBlock.blockHeader.hash) {
        console.log(
          `Error: Invalid hash: ${hash} ${newBlock.blockHeader.hash}`
        );
        return false;
      }
    }
  }
  return true;
}

let storeBlock = async (newBlock) => {
  return new Promise((resolve, reject) => {
    db.put("block_" + newBlock.index, JSON.stringify(newBlock), function (err) {
      if (err) {
        console.error("Error storing block:", err);
        reject(err);
      } else {
        if (newBlock.index !== 0)
          console.log("--- Inserting block index: " + newBlock.index);
        resolve(newBlock); // resolve with newBlock when it's successfully stored
      }
    });
  });
};

async function addBlockToChain(newBlock) {
  const existingBlock = await getBlockFromLevelDB(newBlock.index);
  if (existingBlock) {
    console.log(
      chalk.blue.bold(
        `Block with index ${newBlock.index} already exists, skipping`
      )
    );
    return;
  }
  // Get the total count of blocks in your blockchain
  let totalBlocks = await getBlockHeight();

  console.log(`Current Local Block No:`, totalBlocks);

  let previousBlock = null;

  if (totalBlocks > 0) {
    // if blocks exist, get the last block
    previousBlock = await getBlockFromLevelDB(totalBlocks);
  } else if (totalBlocks === 0) {
    // if no blocks exist yet (other than genesis), get the genesis block
    previousBlock = await getBlockFromLevelDB(0);
  } else {
    // handle error case if totalBlocks is less than 0
    throw new Error("Invalid block count");
  }

  // Ensure that previousBlock is not null before proceeding
  if (!previousBlock) {
    console.log("Error: No previous block could be retrieved");
    return;
  }

  if (isValidNewBlock(newBlock, previousBlock)) {
    try {
      return await lock.acquire("transaction", async () => {
        try {
          // Create a helper function to handle single transaction
          const handleSingleTransaction = async (transaction) => {
            if (await validateTransaction(transaction)) {
              // Store transaction if it's valid
              await storeTransaction(transaction);

              tp.removeTransactions([transaction]);
              return transaction.fee;
            }
            // If transaction is not valid, return 0 as fee
            return 0;
          };

          // Handle single or multiple transactions
          let totalFee = 0;
          if (Array.isArray(newBlock.transactions)) {
            for (let transaction of newBlock.transactions) {
              console.log(`Handling multiple transactions`);
              totalFee += await handleSingleTransaction(transaction);
            }
          } else {
            console.log(`Handling single transaction`);
            totalFee = await handleSingleTransaction(newBlock.transactions);
          }

          await rewardMiner(newBlock);
          // Store block
          await storeBlock(newBlock);
          return newBlock;
        } catch (error) {
          console.error("Error processing transaction:", error);
        }
      });
    } catch (error) {
      console.error("Error acquiring lock:", error);
    }
    // return newBlock;
  } else {
    console.log("Error: Invalid block");
  }
}

async function validateTransaction(transactions) {
  if (!Array.isArray(transactions)) {
    transactions = [transactions];
  }

  let valid = true;

  for (let transaction of transactions) {
    if (transaction.sender === "coinbase") {
      console.log(`Genesis Block detected`);
      continue; // skip genesis block, it's already been processed
    }

    const key = ec.keyFromPublic(transaction.sender, "hex");
    const validSignature = key.verify(
      calculateHashForTransaction(transaction),
      transaction.signature
    );

    if (!validSignature) {
      console.log(
        `Invalid transaction from ${transaction.sender} due to invalid signature`
      );
      valid = false;
      break;
    }

    try {
      let senderBalance = await getBalance(transaction.sender);
      senderBalance = senderBalance || 0;
      if (transaction.amount + TRANSACTION_FEE > senderBalance) {
        console.log(
          `Invalid transaction from ${transaction.sender} due to insufficient funds`
        );
        valid = false;
        break;
      } else {
        await updateBalance(
          transaction.sender,
          senderBalance - transaction.amount - TRANSACTION_FEE
        );
        let receiverBalance = await getBalance(transaction.receiver);
        receiverBalance = receiverBalance || 0;
        await updateBalance(
          transaction.receiver,
          receiverBalance + transaction.amount
        );
      }
    } catch (err) {
      console.log(`Error fetching balance: `, err);
      valid = false;
      break;
    }
  }

  return valid;
}

function calculateHashForTransaction(transaction) {
  return crypto
    .createHash("sha256")
    .update(
      transaction.sender +
        transaction.receiver +
        transaction.amount +
        transaction.fee +
        transaction.time
    )
    .digest("hex");
}

async function validateTransfer(transaction) {
  if (transaction.sender === "genesis") {
    console.log(`Genesis Block detected`);
    await updateBalance(transaction.receiver, transaction.amount);
    return true;
  }
  const key = ec.keyFromPublic(transaction.sender, "hex");
  const validSignature = key.verify(
    calculateHashForTransaction(transaction),
    transaction.signature
  );
  if (!validSignature) {
    console.log(
      `Invalid transaction from ${transaction.sender} due to invalid signature`
    );
    return false;
  }

  try {
    let senderBalance = await getBalance(transaction.sender);
    senderBalance = senderBalance || 0;
    if (transaction.amount + TRANSACTION_FEE > senderBalance) {
      console.log(
        `Invalid transaction from ${transaction.sender} due to insufficient funds`
      );
      return false;
    } else {
      return true;
    }
  } catch (err) {
    console.log(`Error fetching balance: `, err);
    return false;
  }
}

async function createAndAddTransaction(block, transactions, minerAddress) {
  try {
    return await lock.acquire("transaction", async () => {
      try {
        // Create a helper function to handle single transaction
        const handleSingleTransaction = async (transaction) => {
          if (await validateTransfer(transaction)) {
            // Calculate the hash for the transaction
            let transactionHash = transaction.calculateHash();
            // Store this hash in the transaction object as transaction.id
            transaction.id = transactionHash;
            // Check if a transaction with the same hash is already in the block
            if (
              !block.transactions.some(
                (t) => t.calculateHash() === transactionHash
              )
            ) {
              // If not, add the transaction to the block
              block.transactions.push(transaction);
              return transaction.fee;
            }
          }
          return 0;
        };

        // Handle single or multiple transactions
        let totalFee = 0;
        if (Array.isArray(transactions)) {
          for (let transaction of transactions) {
            totalFee += await handleSingleTransaction(transaction);
          }
        } else {
          totalFee = await handleSingleTransaction(transactions);
        }

        // Check if the total supply after the transactions and the fee would exceed the maximum supply
        let totalSupply = await getTotalSupply();

        console.log(`totalSupply`, totalSupply);
        if (
          totalSupply +
            block.transactions.reduce(
              (sum, transaction) => sum + transaction.amount,
              0
            ) +
            totalFee >
          MAX_SUPPLY
        ) {
          console.log(
            "Error: These transactions would exceed the maximum supply of tokens"
          );
          return;
        }

        // Create miner reward transaction
        let minerRewardTransaction = new Transaction(
          "coinbase",
          minerAddress,
          MINING_REWARD,
          totalFee,
          undefined,
          new Date().getTime()
        );

        // Calculate the hash and assign it directly to the object
        minerRewardTransaction.id = minerRewardTransaction.calculateHash();

        // Add the miner reward transaction to the block
        block.transactions.unshift(minerRewardTransaction);

        // Recalculate the Merkle root and mine the block
        block.blockHeader.merkleRoot = new MerkleTree(
          block.transactions
        ).getMerkleRoot();
        // console.log(`transactions inside block`, transactions);

        return await mineBlock(block);
      } catch (error) {
        console.error("Error processing transaction:", error);
      }
    });
  } catch (error) {
    console.error("Error acquiring lock:", error);
  }
}

function getWalletBalance(walletAddress) {
  return new Promise((resolve, reject) => {
    // Prepend 'wallet-' to the walletAddress key
    db.get(`wallet-${walletAddress}`, function (err, balance) {
      if (err) {
        if (err.notFound) {
          console.log(`Wallet address ${walletAddress} does not exist.`);
          resolve(0);
        } else {
          reject(err);
        }
      } else {
        console.log(
          `The balance of wallet address ${walletAddress} is ${balance}.`
        );
        resolve(Number(balance));
      }
    });
  });
}

let getLatestBlock = async () => {
  const blockHeight = await getBlockHeight();
  return await getBlockFromLevelDB(blockHeight);
};

let getDbBlock = (index, res) => {
  db.get(index, function (err, value) {
    if (err) res.send(JSON.stringify(err));
    else res.send(value);
  });
};

let getBlock = (index) => {
  if (blockchain.length - 1 >= index) return blockchain[index];
  else return null;
};

function getBalance(user) {
  return new Promise((resolve, reject) => {
    // Prepend 'wallet-' to the user key
    db.get(`wallet-${user}`, function (err, balance) {
      if (err) {
        if (err.notFound) {
          resolve(0);
        } else {
          reject(err);
        }
      } else {
        resolve(parseInt(balance));
      }
    });
  });
}

function updateBalance(user, amount) {
  return new Promise((resolve, reject) => {
    // Prepend 'wallet-' to the user key
    db.put(`wallet-${user}`, amount, function (err) {
      if (err) {
        console.log(`Failed to update balance for ${user}: `, err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function getBlockFromLevelDB(index) {
  return new Promise((resolve, reject) => {
    db.get("block_" + index, function (err, value) {
      if (err) {
        if (err.type === "NotFoundError") {
          resolve(undefined);
        } else {
          console.log("Block " + index + " get failed", err);
          reject(err);
        }
      } else {
        resolve(JSON.parse(value));
      }
    });
  });
}

async function storeTransaction(transaction) {
  // Create a new Transaction instance from the received data
  const transactionInstance = new Transaction(
    transaction.sender,
    transaction.receiver,
    transaction.amount,
    transaction.fee,
    transaction.signature,
    transaction.time,
    transaction.id
  );

  const transactionHash = transactionInstance.calculateHash();

  try {
    await db.put(transactionHash, JSON.stringify(transactionInstance));
    return console.log("Stored transaction with hash:", transactionHash);
  } catch (err) {
    console.error("Error storing transaction:", err);
  }
}

function getTransaction(transactionHash) {
  return new Promise((resolve, reject) => {
    db.get(transactionHash, function (err, value) {
      if (err) {
        if (err.type === "NotFoundError") {
          console.log(`Transaction not found with hash: ${transactionHash}`);
          resolve(null);
        } else {
          console.error("Error retrieving transaction:", err);
          reject(err);
        }
      } else {
        console.log("Retrieved transaction with hash:", transactionHash);
        resolve(JSON.parse(value));
      }
    });
  });
}

let getBlockHeight = async () => {
  return new Promise((resolve, reject) => {
    let height = 0;
    db.createReadStream()
      .on("data", function (data) {
        if (data.key.toString().startsWith("block_")) {
          height++;
        }
      })
      .on("error", function (err) {
        console.error("Error reading data stream:", err);
        reject(err);
      })
      .on("end", function () {
        resolve(height - 1); // Subtract 1 to match the highest block index
      });
  });
};

async function getTotalSupply() {
  let totalSupply = 0;

  // Create a read stream for the database
  let stream = db.createReadStream();

  // Listen for data events, which are emitted for each entry in the database
  stream.on("data", function (data) {
    // Convert the key to a string and check if it starts with 'wallet-' before trying to parse
    if (data.key.toString().startsWith("wallet-")) {
      let balance = parseInt(data.value);
      totalSupply += balance;
    }
  });

  // Return a promise that resolves with the total supply when the stream ends
  return new Promise((resolve, reject) => {
    stream.on("end", function () {
      resolve(totalSupply);
    });
    stream.on("error", function (err) {
      reject(err);
    });
  });
}

module.exports = {
  addBlockToChain: addBlockToChain,
  createNewBlock: createNewBlock,
  mineBlock: mineBlock,
  createAndAddTransaction: createAndAddTransaction,
  createDb: createDb,
  getWalletBalance: getWalletBalance,
  validateTransfer: validateTransfer,
  getDbBlock: getDbBlock,
  getBlock: getBlock,
  getLatestBlock: getLatestBlock,
  getBlockHeight: getBlockHeight,
  blockchain: blockchain,
  getTotalSupply: getTotalSupply,
  getTransaction: getTransaction,
  getBlockFromLevelDB: getBlockFromLevelDB,
};
