const express = require("express");
const https = require("https");
const fs = require("fs");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

const app = express();
app.use(express.json());

app.use(express.static("public"));

/* -------------------------
   BankID HTTPS Agent Setup
-------------------------- */

const pfx = fs.readFileSync("./FPTestcert5_20240703/FPTestcert5_20240610.p12");

const ca = fs.readFileSync("./certs/bankid_test_root_ca.pem");

const bankidAgent = new https.Agent({
  pfx,
  passphrase: "qwerty123",
  ca,
});

/* -------------------------
   Simple Fake Store
-------------------------- */

const products = [
  { id: 1, name: "T-Shirt", price: 199 },
  { id: 2, name: "Shoes", price: 899 },
];

let carts = {}; // cartId -> items
let orders = {}; // orderRef -> order info

/* -------------------------
   Get Products
-------------------------- */

app.get("/products", (req, res) => {
  res.json(products);
});

/* -------------------------
   Create Cart
-------------------------- */

app.post("/cart", (req, res) => {
  const cartId = uuidv4();
  carts[cartId] = [];
  res.json({ cartId });
});

/* -------------------------
   Add Item To Cart
-------------------------- */

app.post("/cart/:cartId/add", (req, res) => {
  const { productId } = req.body;
  const cart = carts[req.params.cartId];

  if (!cart) return res.status(404).json({ error: "Cart not found" });

  const product = products.find((p) => p.id === productId);
  if (!product) return res.status(404).json({ error: "Product not found" });

  cart.push(product);
  res.json({ message: "Added", cart });
});

/* -------------------------
   Checkout (Start BankID Auth)
-------------------------- */

app.post("/checkout/:cartId", async (req, res) => {
  const cart = carts[req.params.cartId];
  if (!cart || cart.length === 0)
    return res.status(400).json({ error: "Cart empty" });

  try {
    const bankidResponse = await axios.post(
      "https://appapi2.test.bankid.com/rp/v6.0/auth",
      {
        endUserIp: req.ip || "127.0.0.1",
      },
      { httpsAgent: bankidAgent },
    );

    const { orderRef, autoStartToken } = bankidResponse.data;

    orders[orderRef] = {
      cart,
      status: "pending",
    };

    // res.json({
    //   message: "Authenticate with BankID",
    //   orderRef,
    //   autoStartToken,
    //   launchUrl: `bankid:///?autostarttoken=${autoStartToken}&redirect=null`,
    // });

    res.json({
      orderRef,
      autoStartToken,
      qrStartToken: bankidResponse.data.qrStartToken,
      qrStartSecret: bankidResponse.data.qrStartSecret,
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "BankID error" });
  }
});

/* -------------------------
   Poll Collect
-------------------------- */

app.get("/collect/:orderRef", async (req, res) => {
  try {
    const response = await axios.post(
      "https://appapi2.test.bankid.com/rp/v6.0/collect",
      { orderRef: req.params.orderRef },
      { httpsAgent: bankidAgent },
    );

    const data = response.data;

    if (data.status === "complete") {
      orders[req.params.orderRef].status = "paid";
    }

    res.json(data);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Collect failed" });
  }
});

app.post("/generate-qr", (req, res) => {
  const { qrStartToken, qrStartSecret, time } = req.body;

  const qrAuthCode = crypto
    .createHash("sha256")
    .update(qrStartSecret + time)
    .digest("hex");

  const qrData = `bankid.${qrStartToken}.${time}.${qrAuthCode}`;

  res.json({ qrData });
});

/* -------------------------
   Start Server
-------------------------- */

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
