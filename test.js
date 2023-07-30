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

("1.0.000000a669df33274c64478b8e556064ef88c6a0282e6808ff3b636ed229bb75377284d256347a8e3056a1f54e90c7f129c58382d91405972281dade3512dacae1690625760003113301");

async function mineBlock(block) {
  let hash = calculateHashForBlock(block);
  console.log(`Mining for hash`, hash);
  while (hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")) {
    block.nonce++;
    hash = calculateHashForBlock(block);
  }

  block.blockHeader.hash = hash;

  return true;
}
