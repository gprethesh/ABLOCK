const Hyperswarm = require("hyperswarm");
const { Block, BlockHeader } = require("./block.js");
const crypto = require("crypto");

const swarm2 = new Hyperswarm();

const difficulty = 0x1C; // Difficulty represented as hexadecimal
const maximumTarget =
  BigInt("0x00000FFFFFFF0000000000000000000000000000000000000000000000000000");
const target = maximumTarget / BigInt(difficulty);

function calculateHashForBlock(block) {
  const data = [
    block.blockHeader.version,
    block.blockHeader.previousBlockHeader,
    block.blockHeader.merkleRoot,
    block.blockHeader.time,
    block.nonce.toString(),
  ].join("");

  return crypto.createHash("sha256").update(data).digest("hex");
}

async function mineBlock(block) {
  console.log("target", target.toString());
  let hash = calculateHashForBlock(block);
  console.log("Mining for hash", hash);
  while (BigInt("0x" + hash) > target) {
    block.nonce++;
    hash = calculateHashForBlock(block);
  }

  block.blockHeader.difficulty = "0x" + difficulty.toString(16); // Difficulty as hexadecimal
  block.blockHeader.hash = hash;
  return block;
}

async function createNewBlock(transactions, minerAddress) {
  const userTransactions = transactions.filter(
    (transaction) =>
      transaction.sender !== "coinbase" && transaction.sender !== "system"
  );

  const blockHeader = await createNewBlockHeader(transactions);
  const index = 1;
  console.log("INDEX", index);

  const newBlock = new Block(blockHeader, index, transactions, userTransactions);

  return newBlock;
}

async function createNewBlockHeader(transactions) {
  const timestamp = new Date().getTime();
  const version = "1.0.0";
  const previousBlockHeader = "12344567788"; // Placeholder value
  const merkleRoot = "67868769868"; // Placeholder value
  const difficulty = null; // Placeholder value

  return new BlockHeader(version, previousBlockHeader, merkleRoot, timestamp, difficulty);
}

const run = async () => {
  const block1 = await createNewBlock([], "hello");

  console.log("block Created");

  const minedBlock = await mineBlock(block1);
  console.log(minedBlock);

  swarm2.on("connection", (conn, info) => {
    console.log("inside");
    conn.on("data", (data) =>
      console.log("client got message:", data.toString())
    );
  });

  const callFun = async () => {
    const topic = Buffer.alloc(32, "UPOW"); // Fixed length buffer
    console.log("Joining topic:", topic.toString());
    const discovery = swarm2.join(topic, { server: false, client: true });
    await discovery.flushed();
    console.log("Topic announced on DHT");
    await swarm2.flush();
    console.log("done");
  };

  callFun();
};

run();
