const axios = require("axios");

async function getMempool() {
  try {
    const response = await axios.get("http://localhost:8020/mempool");
    console.log(response.data);
  } catch (error) {
    console.error(error);
  }
}

getMempool();
