let cartId = null;
let orderRef = null;
let autoStartToken = null;
let qrStartToken = null;
let qrStartSecret = null;
let pollInterval = null;
let qrInterval = null;

async function init() {
  const cartRes = await fetch("/cart", { method: "POST" });
  const cartData = await cartRes.json();
  cartId = cartData.cartId;

  const productsRes = await fetch("/products");
  const products = await productsRes.json();

  const container = document.getElementById("products");

  products.forEach((product) => {
    const div = document.createElement("div");
    div.className = "product";
    div.innerHTML = `
      <div>
        <strong>${product.name}</strong><br>
        ${product.price} SEK
      </div>
      <button onclick="addToCart(${product.id})">
        Add
      </button>
    `;
    container.appendChild(div);
  });
}

async function addToCart(productId) {
  await fetch(`/cart/${cartId}/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId }),
  });

  renderCart();
}

async function renderCart() {
  const res = await fetch(`/cart/${cartId}`);
  const cart = await res.json();

  const cartDiv = document.getElementById("cart");
  cartDiv.innerHTML = "";

  cart.forEach((item) => {
    const div = document.createElement("div");
    div.className = "product";
    div.innerHTML = `${item.name} - ${item.price} SEK`;
    cartDiv.appendChild(div);
  });
}

async function checkout() {
  const res = await fetch(`/checkout/${cartId}`, {
    method: "POST",
  });

  const data = await res.json();

  orderRef = data.orderRef;
  autoStartToken = data.autoStartToken;
  qrStartToken = data.qrStartToken;
  qrStartSecret = data.qrStartSecret;

  document.getElementById("bankid-options").style.display = "block";
  document.getElementById("status").innerHTML =
    `<div class="pending">Choose how to authenticate</div>`;

  startPolling();
}

function openSameDevice() {
  window.location.href = `bankid:///?autostarttoken=${autoStartToken}&redirect=null`;
}

function showQR() {
  const qrDiv = document.getElementById("qr-container");
  qrDiv.innerHTML = "";

  qrInterval = setInterval(async () => {
    const time = Math.floor(Date.now() / 1000);

    const response = await fetch("/generate-qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qrStartToken,
        qrStartSecret,
        time,
      }),
    });

    const { qrData } = await response.json();

    qrDiv.innerHTML = "";
    QRCode.toCanvas(qrData, { width: 250 }, function (err, canvas) {
      if (!err) qrDiv.appendChild(canvas);
    });
  }, 1000);
}

function startPolling() {
  pollInterval = setInterval(async () => {
    const res = await fetch(`/collect/${orderRef}`);
    const data = await res.json();

    if (data.status === "complete") {
      clearInterval(pollInterval);
      clearInterval(qrInterval);

      document.getElementById("status").innerHTML =
        `<div class="success">Order Paid 🎉</div>`;
    }

    if (data.status === "failed") {
      clearInterval(pollInterval);
      clearInterval(qrInterval);

      document.getElementById("status").innerHTML =
        `<div style="color:red;">Authentication Failed</div>`;
    }
  }, 2000);
}

window.onload = init;
