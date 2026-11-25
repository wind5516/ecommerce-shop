// 商城前台逻辑
const API = "";
let token = localStorage.getItem("token") || "";
let user = JSON.parse(localStorage.getItem("user") || "null");
let state = { view: "shop", categories: [], keyword: "", categoryId: 0 };

async function api(path, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || "请求失败");
  return data;
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function renderUserBox() {
  const box = document.getElementById("userBox");
  if (user) {
    box.innerHTML = `👤 ${user.username}（${user.role === "admin" ? "管理员" : "用户"}）
      <button class="btn ghost" onclick="logout()">退出</button>`;
  } else {
    box.innerHTML = `<button class="btn ghost" onclick="openAuth('login')">登录</button>
      <button class="btn" onclick="openAuth('register')">注册</button>`;
  }
}

function logout() {
  token = ""; user = null;
  localStorage.removeItem("token"); localStorage.removeItem("user");
  renderUserBox(); switchView("shop"); toast("已退出登录");
}

function openAuth(mode) {
  document.getElementById("modal").innerHTML = `
  <div class="modal-mask" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <h3>${mode === "login" ? "登录" : "注册"}</h3>
      <div class="field"><label>用户名</label><input id="au" placeholder="3-20 位"></div>
      <div class="field"><label>密码</label><input id="ap" type="password" placeholder="${mode === "register" ? "至少 6 位" : ""}"></div>
      <div class="actions">
        <button class="btn gray" onclick="closeModal()">取消</button>
        <button class="btn" onclick="submitAuth('${mode}')">${mode === "login" ? "登录" : "注册"}</button>
      </div>
    </div>
  </div>`;
}

async function submitAuth(mode) {
  const username = document.getElementById("au").value.trim();
  const password = document.getElementById("ap").value;
  try {
    const data = await api("/api/auth/" + mode, "POST", { username, password });
    token = data.token; user = data.user;
    localStorage.setItem("token", token); localStorage.setItem("user", JSON.stringify(user));
    closeModal(); renderUserBox(); toast(mode === "login" ? "登录成功" : "注册成功，已自动登录");
    refreshCartCount();
  } catch (e) { toast(e.message); }
}

function closeModal() { document.getElementById("modal").innerHTML = ""; }

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  render();
}

async function refreshCartCount() {
  if (!token) { document.getElementById("cartCount").textContent = 0; return; }
  try {
    const data = await api("/api/cart");
    document.getElementById("cartCount").textContent = data.items.reduce((s, i) => s + i.quantity, 0);
  } catch (e) { document.getElementById("cartCount").textContent = 0; }
}

// ---------- 首页商品 ----------
async function renderShop() {
  const main = document.getElementById("main");
  if (!state.categories.length) {
    try { state.categories = (await api("/api/products/meta/categories")).items; } catch (e) {}
  }
  const catOpts = `<option value="0">全部分类</option>` + state.categories.map(c => `<option value="${c.id}" ${state.categoryId === c.id ? "selected" : ""}>${c.name}</option>`).join("");
  main.innerHTML = `
    <div class="toolbar">
      <select id="catSel" onchange="state.categoryId=+this.value;render()">${catOpts}</select>
      <input type="text" id="kw" placeholder="搜索商品…" value="${state.keyword}">
      <button class="btn" onclick="state.keyword=document.getElementById('kw').value.trim();render()">搜索</button>
    </div>
    <div class="grid" id="grid"><div class="empty">加载中…</div></div>`;
  try {
    const params = new URLSearchParams();
    if (state.categoryId) params.set("category_id", state.categoryId);
    if (state.keyword) params.set("q", state.keyword);
    const data = await api(`/api/products?${params.toString()}`);
    const grid = document.getElementById("grid");
    if (!data.items.length) { grid.innerHTML = `<div class="empty">没有找到商品</div>`; return; }
    grid.innerHTML = data.items.map(p => `
      <div class="card">
        <div class="img">🛍️</div>
        <div class="body">
          <div class="name">${p.name}</div>
          <div class="price">¥${p.price.toFixed(2)}</div>
          <div class="meta"><span>${p.category_name || ""}</span><span>库存 ${p.stock}</span></div>
          <div class="row">
            <button class="btn ${token ? "" : "gray"}" onclick="addCart(${p.id})">加入购物车</button>
            <button class="btn green" onclick="buyNow(${p.id})">立即购买</button>
          </div>
        </div>
      </div>`).join("");
  } catch (e) { toast(e.message); }
}

async function addCart(productId, qty = 1) {
  if (!token) { toast("请先登录"); openAuth("login"); return; }
  try { await api("/api/cart", "POST", { product_id: productId, quantity: qty }); toast("已加入购物车"); refreshCartCount(); } catch (e) { toast(e.message); }
}

async function buyNow(productId) {
  if (!token) { toast("请先登录"); openAuth("login"); return; }
  try {
    await api("/api/cart", "POST", { product_id: productId, quantity: 1 });
    await api("/api/orders", "POST");
    await api("/api/payment/mock", "POST", { order_id: (await api("/api/orders/my")).items[0].id });
    toast("购买成功（模拟支付）"); refreshCartCount(); switchView("orders");
  } catch (e) { toast(e.message); }
}

// ---------- 购物车 ----------
async function renderCart() {
  const main = document.getElementById("main");
  if (!token) { main.innerHTML = `<div class="empty">请先登录后查看购物车</div>`; return; }
  try {
    const data = await api("/api/cart");
    if (!data.items.length) {
      main.innerHTML = `<div class="empty">购物车是空的，去首页逛逛吧</div>`;
      return;
    }
    main.innerHTML = `<h2 style="margin-bottom:14px">购物车</h2>` + data.items.map(i => `
      <div class="cart-item">
        <div class="info">
          <div style="font-weight:600">${i.name}</div>
          <div style="color:#6b7280;font-size:13px">¥${i.price.toFixed(2)} × ${i.quantity} = <b style="color:#ef4444">¥${(i.price*i.quantity).toFixed(2)}</b></div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="qty">
            <button onclick="changeQty(${i.product_id},${i.quantity-1})">−</button>
            <span>${i.quantity}</span>
            <button onclick="changeQty(${i.product_id},${i.quantity+1})">＋</button>
          </div>
          <button class="btn red" onclick="removeCart(${i.product_id})">删除</button>
        </div>
      </div>`).join("") + `
      <div class="summary">
        <div>共 <span id="sumQty">0</span> 件商品</div>
        <div><span style="color:#6b7280">合计：</span><span class="total">¥${data.total.toFixed(2)}</span>
          <button class="btn green" style="margin-left:12px" onclick="checkout()">去结算</button></div>
      </div>`;
    document.getElementById("sumQty").textContent = data.items.reduce((s, i) => s + i.quantity, 0);
  } catch (e) { toast(e.message); }
}

async function changeQty(productId, qty) {
  if (qty < 1) return;
  try { await api(`/api/cart/${productId}`, "PATCH", { quantity: qty }); render(); refreshCartCount(); } catch (e) { toast(e.message); }
}

async function removeCart(productId) {
  try { await api(`/api/cart/${productId}`, "DELETE"); render(); refreshCartCount(); } catch (e) { toast(e.message); }
}

async function checkout() {
  try {
    const order = await api("/api/orders", "POST");
    await api("/api/payment/mock", "POST", { order_id: order.id });
    toast("下单并支付成功！订单号 " + order.order_no);
    refreshCartCount(); switchView("orders");
  } catch (e) { toast(e.message); }
}

// ---------- 我的订单 ----------
const STATUS = { pending: "待付款", paid: "已付款", shipped: "已发货", completed: "已完成", cancelled: "已取消" };

async function renderOrders() {
  const main = document.getElementById("main");
  if (!token) { main.innerHTML = `<div class="empty">请先登录后查看订单</div>`; return; }
  try {
    const data = await api("/api/orders/my");
    if (!data.items.length) { main.innerHTML = `<div class="empty">还没有订单</div>`; return; }
    main.innerHTML = `<h2 style="margin-bottom:14px">我的订单</h2>` + data.items.map(o => `
      <div class="order-card">
        <div class="order-head">
          <span>订单号：${o.order_no}</span>
          <span class="order-status ${o.status}">${STATUS[o.status] || o.status}</span>
        </div>
        ${o.items.map(it => `<div style="font-size:13px;padding:2px 0">${it.product_name} × ${it.quantity}　¥${(it.price*it.quantity).toFixed(2)}</div>`).join("")}
        <div class="order-head" style="margin-top:8px">
          <span>下单时间：${o.created_at}</span>
          <span>合计：<b style="color:#ef4444">¥${o.total_amount.toFixed(2)}</b></span>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
          ${o.status === "pending" ? `<button class="btn green" onclick="payOrder(${o.id})">立即支付</button><button class="btn gray" onclick="cancelOrder(${o.id})">取消订单</button>` : ""}
        </div>
      </div>`).join("");
  } catch (e) { toast(e.message); }
}

async function payOrder(orderId) {
  try { await api("/api/payment/mock", "POST", { order_id: orderId }); toast("支付成功（模拟）"); render(); } catch (e) { toast(e.message); }
}

async function cancelOrder(orderId) {
  try { await api(`/api/orders/${orderId}/cancel`, "POST"); toast("订单已取消，库存已回补"); render(); } catch (e) { toast(e.message); }
}

// ---------- 主渲染 ----------
async function render() {
  renderUserBox();
  if (state.view === "shop") await renderShop();
  else if (state.view === "cart") await renderCart();
  else await renderOrders();
}

// 事件绑定
document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => switchView(b.dataset.view));
render();
refreshCartCount();
