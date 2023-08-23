const Hyperswarm = require("hyperswarm");
const Block = require("./block.js").Block;
const BlockHeader = require("./block.js").BlockHeader;
const crypto = require("crypto");

const swarm2 = new Hyperswarm();

const difficulty = 25;

const maximumTarget =
  "0x00000FFFFFFF0000000000000000000000000000000000000000000000000000";
const target = maximumTarget / difficulty;

function calculateHashForBlock(block) {
  return crypto
    .createHash("sha256")
    .update(
      block.blockHeader.version +
        block.blockHeader.previousBlockHeader +
        block.blockHeader.merkleRoot +
        block.blockHeader.time +
        block.nonce
    )
    .digest("hex");
}

async function mineBlock(block) {
  console.log(`target`, target);
  let hash = calculateHashForBlock(block);
  console.log(`Mining for hash`, hash);
  while (parseInt(hash, 16) > target) {
    block.nonce++;
    hash = calculateHashForBlock(block);
  }

  block.blockHeader.difficulty = target;

  block.blockHeader.hash = hash;

  return block;
}

async function createNewBlock(transactions, minerAddress) {
  let userTransactions = [...transactions]; // Copy the original transactions first

  let tx = userTransactions.filter(
    (transaction) =>
      transaction.sender !== "coinbase" && transaction.sender !== "system"
  );

  let blockHeader = await createNewBlockHeader(transactions);
  let index = 1;
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
  let previousBlockHeader = await "12344567788";

  let merkleTree = "1578676876678";
  let merkleRoot = "67868769868";
  let difficulty = null;
  return new BlockHeader(
    version,
    previousBlockHeader,
    merkleRoot,
    timestamp,
    difficulty
  );
}

const run = async () => {
  const block1 = await createNewBlock([], "hello");

  console.log(`block Created`);

  const data = mineBlock(block1);
  console.log(data);

  swarm2.on("connection", (conn, info) => {
    console.log(`inside`);

    // setInterval(() => {
    //   const data = mineBlock(block1);
    //   console.log(data);
    // }, 10000);
    conn.on("data", (data) =>
      console.log("client got message:", data.toString())
    );
  });

  const callFun = async () => {
    const topic = Buffer.alloc(32).fill("UPOW"); // A topic must be 32 bytes
    console.log("Joining topic:", topic.toString());
    const discovery = swarm2.join(topic, { server: false, client: true }); // Change here
    await discovery.flushed(); // Waits for the topic to be fully announced on the DHT
    console.log("Topic announced on DHT");
    await swarm2.flush();
    console.log(`done`);
  };

  callFun();
};

run();
