const runtimeConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  flutterwavePublicKey: import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY || '',
  appUrl: import.meta.env.VITE_APP_URL || '',
  supportWhatsappUrl: import.meta.env.VITE_SUPPORT_WHATSAPP_URL || ''
};

const supportEmail = 'teamfeji4@gmail.com';
const supabaseClient = runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey && window.supabase
  ? window.supabase.createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey)
  : null;

const state = {
  user: null,
  session: null,
  profile: null,
  wallet: null,
  transactions: [],
  products: [],
  isAdmin: false,
  showAllServices: false,
  route: window.location.pathname || '/',
  admin: { loading: false, users: [], transactions: [], statsTransactions: [], pricing: [], announcements: [], support: null, userCount: 0, error: '', statusFilter: '', referenceFilter: '' }
};

const serviceCards = [
  { kind: 'airtime', type: 'airtime', title: 'Airtime', letter: 'A' },
  { kind: 'data', type: 'data', title: 'Data', letter: 'D' },
  { kind: 'tv', type: 'tv', title: 'Cable', letter: 'C' },
  { kind: 'electricity', type: 'electricity', title: 'Electricity', letter: 'E' },
  { kind: 'education', type: 'education', title: 'Education pins', letter: 'P' },
  { kind: 'data_card', type: 'data_card', title: 'Data card pins', letter: 'D' },
  { kind: 'recharge_card', type: 'recharge_card', title: 'Recharge card pins', letter: 'R' }
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const money = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
const dateText = (value) => value ? new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const firstName = () => (state.profile?.full_name || state.user?.email?.split('@')[0] || '').trim().split(/\s+/)[0];
const randomPart = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3500);
}

function openModal({ kicker = 'PUDATA', title, intro = '', body }) {
  $('#modal-kicker').textContent = kicker;
  $('#modal-title').textContent = title;
  $('#modal-intro').textContent = intro;
  $('#modal-body').innerHTML = body;
  $('#modal-layer').classList.add('is-open');
  $('#modal-layer').setAttribute('aria-hidden', 'false');
}
function closeModal() {
  $('#modal-layer').classList.remove('is-open');
  $('#modal-layer').setAttribute('aria-hidden', 'true');
}
function openDrawer() {
  document.body.classList.add('drawer-open');
  $('#drawer').setAttribute('aria-hidden', 'false');
}
function closeDrawer() {
  document.body.classList.remove('drawer-open');
  $('#drawer').setAttribute('aria-hidden', 'true');
}

async function invokeFunction(name, body) {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data, error } = await supabaseClient.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

async function loadCatalogue() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.from('catalogue_products').select('id,service_id,category_id,name,description,product_type,selling_price,active,metadata').eq('active', true).order('name');
  if (!error) state.products = data || [];
}

async function loadUserData() {
  if (!supabaseClient || !state.user) {
    state.profile = null;
    state.wallet = null;
    state.transactions = [];
    state.isAdmin = false;
    return;
  }
  const [profileResult, walletResult, transactionResult] = await Promise.all([
    supabaseClient.from('profiles').select('id,email,full_name,phone,role,suspended,created_at').eq('id', state.user.id).single(),
    supabaseClient.from('wallets').select('balance,currency,updated_at').eq('user_id', state.user.id).single(),
    supabaseClient.from('transactions').select('id,client_reference,service_type,status,amount,currency,pulseflow_ref,created_at,updated_at,pin_payload,failure_reason').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(50)
  ]);
  state.profile = profileResult.data || null;
  state.wallet = walletResult.data || { balance: 0, currency: 'NGN' };
  state.transactions = transactionResult.data || [];
  state.isAdmin = Boolean(state.profile && !state.profile.suspended && ['admin', 'support'].includes(state.profile.role));
}

async function syncSession() {
  if (!supabaseClient) {
    render();
    return;
  }
  const { data } = await supabaseClient.auth.getSession();
  state.session = data.session;
  state.user = data.session?.user || null;
  await Promise.all([loadUserData(), loadCatalogue()]);
  render();
  await retryPendingGuestPurchase();
}

function serviceProducts(type) {
  return state.products.filter((product) => product.product_type === type && product.active);
}
function serviceIsAvailable(card) {
  return card.type !== 'electricity' && serviceProducts(card.type).length > 0;
}

function renderDashboard() {
  const now = new Date();
  const greeting = state.user ? `Good ${now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}, ${escapeHtml(firstName())}!` : 'Welcome to pudata';
  const walletContent = state.user
    ? `<div class="wallet-top"><div><span class="wallet-label">YOUR WALLET</span><strong class="wallet-balance">${money(state.wallet?.balance)}</strong></div><button class="refresh-button" type="button" data-action="refresh-wallet" aria-label="Refresh wallet">↻</button></div><div class="wallet-bottom"><span class="wallet-note">Available for active services.</span><button class="button button-light" type="button" data-action="fund-wallet">Add Funds <span>+</span></button></div>`
    : `<div class="wallet-top"><div><span class="wallet-label">YOUR WALLET</span><strong class="wallet-balance">Log in to fund your wallet</strong></div><button class="refresh-button" type="button" data-action="login" aria-label="Log in">↗</button></div><div class="wallet-bottom"><span class="wallet-note">Guest checkout remains available.</span><button class="button button-light" type="button" data-action="login">Log in <span>↗</span></button></div>`;
  const visible = state.showAllServices ? serviceCards : serviceCards.slice(0, 4);
  const servicesHtml = visible.map((card) => {
    const available = serviceIsAvailable(card);
    return `<button class="service-card ${available ? '' : 'is-disabled'}" type="button" ${available ? `data-action="service" data-service="${card.kind}"` : 'disabled'}><span class="service-icon">${card.letter}</span><span><strong class="service-title">${card.title}</strong><small class="service-status">${available ? 'Available' : 'Coming soon'}</small></span></button>`;
  }).join('');
  const transactions = state.user ? state.transactions.slice(0, 5) : [];
  const transactionHtml = !state.user
    ? `<div class="empty-state"><strong>No transactions yet</strong>Log in to see your payment history, or keep using guest checkout and save each receipt reference.</div>`
    : transactions.length ? `<div class="transaction-list">${transactions.map(transactionRow).join('')}</div>` : `<div class="empty-state"><strong>No transactions yet</strong>Your completed and pending payments will appear here.</div>`;
  return `<section class="dashboard-head"><div class="date-line">${now.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div><h1>${greeting}</h1><p>Pay for the things that keep your day moving.</p></section><section class="wallet-card">${walletContent}</section><section class="section"><div class="section-heading"><div><h2>Services</h2><p>Choose a service to get started.</p></div><button class="text-button" type="button" data-action="toggle-services">${state.showAllServices ? 'See less' : 'See more'} ${state.showAllServices ? '↑' : '↓'}</button></div><div class="service-grid">${servicesHtml}</div></section><section class="section"><div class="section-heading"><div><h2>History</h2><p>${state.user ? 'Your latest payment activity.' : 'Your payment trail lives here after login.'}</p></div><button class="text-button" type="button" data-action="history">View all</button></div>${transactionHtml}</section>`;
}

function transactionRow(transaction) {
  return `<div class="transaction-row"><div><strong>${escapeHtml(transaction.service_type)}</strong><span>${escapeHtml(transaction.client_reference)} · ${dateText(transaction.created_at)}</span></div><div><span class="status-pill">${escapeHtml(transaction.status)}</span><strong>${money(transaction.amount)}</strong></div></div>`;
}

function renderLegal(kind) {
  const terms = kind === 'terms';
  return `<article class="legal-page"><button class="text-button" type="button" data-route="/">← Back home</button><h1>${terms ? 'Terms of Service' : 'Privacy Policy'}</h1><p>Last updated: 10 November 2026</p>${terms ? `<h2>About pudata</h2><p>pudata is founded and operated by Lodjie Oghenefejiro. It helps customers buy airtime and data, pay for cable TV and electricity when available, and obtain exam pins through third-party suppliers.</p><h2>Accounts and wallet use</h2><p>You are responsible for keeping your account details secure and providing accurate phone, smartcard, and payment information. Wallet funds may be used for active services and are reflected in your account balance.</p><h2>Prices, payments, and delivery</h2><p>Prices and applicable fees are shown before payment and may change when supplier prices change. Payments are processed by Flutterwave. Airtime, data, cable, and available digital pins are normally delivered after successful supplier confirmation. An order can remain pending while a supplier response is being checked.</p><h2>Refunds</h2><p>Failed wallet purchases are refunded to the wallet automatically. Failed guest purchases are refunded after support review. Delivered pins and completed top-ups are not refundable. Purchases sent to the wrong phone number or smartcard number supplied by the customer are not refundable.</p><h2>Acceptable use and availability</h2><p>Do not use pudata for unlawful activity, fraud, abuse, or attempts to interfere with our services. Third-party availability can affect delivery times. We are not liable for indirect loss caused by supplier outages, incorrect customer details, or events outside reasonable control.</p><h2>Changes and governing law</h2><p>We may update these terms as the service changes. Nigerian law governs these terms.</p><h2>Contact</h2><p>Questions can be sent to <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>` : `<h2>What we collect</h2><p>We may collect your email, phone numbers, transaction details, and device or usage data needed to operate and protect pudata.</p><h2>Why we collect it</h2><p>We use information to create accounts, process payments, deliver services, prevent fraud, provide support, keep receipts, and improve reliability.</p><h2>Who receives it</h2><p>We share only what is needed with Flutterwave and our service suppliers to process a payment or deliver a service. We do not store your card details.</p><h2>Security and retention</h2><p>We use access controls and appropriate technical safeguards. We retain information only as long as needed for the service, legal obligations, dispute handling, and accounting.</p><h2>Your rights</h2><p>You may request access, correction, or deletion of your information by emailing <a href="mailto:${supportEmail}">${supportEmail}</a>. Requests are handled in line with applicable Nigerian data protection law.</p><h2>Cookies and children</h2><p>We may use essential cookies or local storage for sessions and checkout recovery. pudata is not intended for children who cannot lawfully consent to the service.</p><h2>Changes and contact</h2><p>We may update this policy when our practices change. Contact <a href="mailto:${supportEmail}">${supportEmail}</a> with questions.</p>`}</article>`;
}

function render() {
  state.route = window.location.pathname || '/';
  if (state.route === '/admin' && !state.isAdmin) {
    window.history.replaceState({}, '', '/');
    state.route = '/';
  }
  const content = $('#page-content');
  if (state.route === '/terms' || state.route === '/privacy') content.innerHTML = renderLegal(state.route.slice(1));
  else if (state.route === '/admin') content.innerHTML = state.isAdmin ? renderAdmin() : renderDashboard();
  else content.innerHTML = renderDashboard();
  updateChrome();
}

function updateChrome() {
  $('[data-avatar]').textContent = (firstName()[0] || 'G').toUpperCase();
  const drawer = $('#drawer-links');
  drawer.innerHTML = `<button type="button" data-action="help"><span>?</span> Help centre</button><button type="button" data-route="/terms"><span>§</span> Terms of Service</button><button type="button" data-route="/privacy"><span>⌁</span> Privacy Policy</button>${state.isAdmin ? '<button type="button" data-route="/admin"><span>⌂</span> Admin</button>' : ''}`;
  $$('.bottom-nav-item').forEach((item) => item.classList.toggle('active', item.dataset.route === state.route || (state.route === '/admin' && item.dataset.action === 'more')));
}

function showAuth(mode = 'login') {
  const signup = mode === 'signup';
  openModal({ kicker: 'ACCOUNT', title: signup ? 'Create your account' : 'Log in to pudata', intro: signup ? 'Save your wallet, receipts, and payment history in one place.' : 'Use your pudata account to fund a wallet and see your history.', body: `<form class="modal-form" id="auth-form" data-mode="${signup ? 'signup' : 'login'}"><div class="field"><label for="auth-email">Email address</label><input id="auth-email" type="email" required /></div>${signup ? '<div class="field"><label for="auth-name">Full name</label><input id="auth-name" type="text" required /></div>' : ''}<div class="field"><label for="auth-password">Password</label><input id="auth-password" type="password" minlength="6" required /></div>${signup ? `<p class="modal-quiet">By signing up you agree to the <a href="/terms" data-route="/terms">Terms of Service</a> and <a href="/privacy" data-route="/privacy">Privacy Policy</a>.</p>` : ''}<div class="modal-actions"><button class="button button-dark" type="submit">${signup ? 'Sign up' : 'Log in'} <span>↗</span></button></div><button class="text-button" type="button" data-action="${signup ? 'login' : 'signup'}">${signup ? 'Already have an account? Log in' : 'Create an account'}</button></form>` });
}

function showProfile() {
  if (!state.user) return showAuth();
  openModal({ kicker: 'ACCOUNT', title: escapeHtml(firstName()), intro: escapeHtml(state.user.email), body: `<div class="receipt"><div class="receipt-rows"><div class="receipt-row"><span>Wallet balance</span><strong>${money(state.wallet?.balance)}</strong></div><div class="receipt-row"><span>Transactions</span><strong>${state.transactions.length}</strong></div><div class="receipt-row"><span>Account role</span><strong>${escapeHtml(state.profile?.role || 'user')}</strong></div></div></div><div class="modal-actions"><button class="button button-dark" type="button" data-action="fund-wallet">Add Funds <span>+</span></button><button class="button button-outline" type="button" data-action="logout">Log out</button></div>` });
}

function showHelp() {
  const whatsapp = runtimeConfig.supportWhatsappUrl ? `<a class="button button-dark" href="${escapeHtml(runtimeConfig.supportWhatsappUrl)}" target="_blank" rel="noreferrer">WhatsApp support ↗</a>` : '<span class="notice">WhatsApp support link is not configured yet.</span>';
  openModal({ kicker: 'HELP CENTRE', title: 'How can we help?', intro: `Email ${supportEmail} for support.`, body: `<div class="admin-list"><div class="notice"><strong>Pending order</strong><br />Keep the original reference. Do not pay again with a new reference.</div><div class="notice"><strong>Failed purchase</strong><br />Wallet purchases are returned automatically when the failure is clear. Guest refunds are reviewed by support.</div><div class="notice"><strong>Wallet funding</strong><br />Funding is credited only after Flutterwave verification.</div></div><div class="modal-actions"><a class="button button-outline" href="mailto:${supportEmail}">Email support ↗</a>${whatsapp}</div>` });
}

function showHistory() {
  openModal({ kicker: 'HISTORY', title: 'Your transactions', intro: state.user ? 'Live records from your account.' : 'Log in to see your account history.', body: state.user ? (state.transactions.length ? `<div class="transaction-list">${state.transactions.map(transactionRow).join('')}</div>` : '<div class="empty-state"><strong>No transactions yet</strong>Your payment activity will appear here.</div>') : '<div class="empty-state"><strong>No transactions yet</strong><button class="button button-dark" type="button" data-action="login">Log in</button></div>' });
}

function productOptions(type) {
  const products = serviceProducts(type);
  return products.map((product) => `<option value="${escapeHtml(product.id)}" data-price="${Number(product.selling_price)}">${escapeHtml(product.name)} · ${money(product.selling_price)}</option>`).join('');
}
function showPurchase(kind) {
  const card = serviceCards.find((item) => item.kind === kind);
  const products = serviceProducts(card.type);
  if (!products.length || kind === 'electricity') return showToast('This service is coming soon.');
  const isAirtime = kind === 'airtime';
  const isData = kind === 'data';
  const isTv = kind === 'tv';
  const isPins = ['education', 'data_card', 'recharge_card'].includes(kind);
  const productField = `<div class="field"><label for="product">Product</label><select id="product">${productOptions(card.type)}</select></div>`;
  const phone = isAirtime || isData ? '<div class="field"><label for="phone">Phone number</label><input id="phone" inputmode="tel" required /></div>' : '';
  const amount = isAirtime ? '<div class="field"><label for="amount">Amount</label><input id="amount" type="number" min="50" step="50" value="100" required /></div>' : '';
  const smartcard = isTv ? '<div class="field"><label for="smart-card">Smartcard number</label><input id="smart-card" inputmode="numeric" required /></div>' : '';
  const quantity = isPins ? '<div class="field"><label for="quantity">Quantity</label><select id="quantity"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>10</option></select></div>' : '';
  const email = !state.user ? '<div class="field"><label for="email">Receipt email</label><input id="email" type="email" required /></div>' : '';
  openModal({ kicker: 'CHECKOUT', title: card.title, intro: state.user ? 'Pay from your live wallet.' : 'Pay with Flutterwave and receive a receipt reference.', body: `<form class="modal-form" id="purchase-form" data-kind="${kind}" data-type="${card.type}">${productField}${phone}${amount}${smartcard}${quantity}${email}<div class="modal-actions"><button class="button button-dark" type="submit">${state.user ? 'Pay from wallet' : 'Continue to payment'} <span>↗</span></button></div></form>` });
}

function walletFundingRef() {
  if (!state.user?.id) throw new Error('Log in to fund your wallet.');
  return `FUND_${state.user.id}_${randomPart()}`;
}
function launchFlutterwave({ amount, txRef, email, onSuccess }) {
  if (!window.FlutterwaveCheckout || !runtimeConfig.flutterwavePublicKey) return showToast('Flutterwave checkout is not configured.');
  window.FlutterwaveCheckout({ public_key: runtimeConfig.flutterwavePublicKey, tx_ref: txRef, amount, currency: 'NGN', payment_options: 'card,banktransfer,ussd', customer: { email }, customizations: { title: 'pudata', description: 'Payment' }, callback: onSuccess, onclose: () => showToast('Checkout closed. You can retry with the same reference.') });
}
function showFundWallet() {
  if (!state.user) return showAuth();
  openModal({ kicker: 'WALLET', title: 'Add Funds', intro: 'Your wallet is credited only after server-side verification.', body: '<form class="modal-form" id="fund-form"><div class="field"><label for="fund-amount">Amount</label><select id="fund-amount"><option value="1000">₦1,000</option><option value="2500">₦2,500</option><option value="5000">₦5,000</option><option value="10000">₦10,000</option></select></div><div class="modal-actions"><button class="button button-dark" type="submit">Continue to payment <span>↗</span></button></div><p class="modal-quiet">Flutterwave verifies the amount, currency, status, and FUND reference before the balance changes.</p></form>' });
}

async function completeGuestPurchase(pending) {
  const result = await invokeFunction('create-purchase', { product_id: pending.product_id, email: pending.email, payment_tx_ref: pending.tx_ref, parameters: pending.parameters });
  localStorage.removeItem('pudata_pending_guest_purchase');
  openModal({ kicker: 'RECEIPT', title: result.status === 'pending' ? 'Payment pending' : 'Payment complete', intro: 'Keep this reference for support or receipt lookup.', body: `<div class="receipt"><div class="receipt-rows"><div class="receipt-row"><span>Reference</span><strong>${escapeHtml(result.reference || pending.tx_ref)}</strong></div><div class="receipt-row"><span>Status</span><strong>${escapeHtml(result.status || 'pending')}</strong></div><div class="receipt-row"><span>Amount</span><strong>${money(pending.amount)}</strong></div></div></div>` });
}
function retryPendingGuestPurchase() {
  const raw = localStorage.getItem('pudata_pending_guest_purchase');
  if (!raw || state.user) return;
  try {
    const pending = JSON.parse(raw);
    openModal({ kicker: 'PAYMENT RETRY', title: 'Finish your guest payment', intro: 'Retry with the same transaction reference.', body: `<div class="receipt"><div class="receipt-row"><span>Reference</span><strong>${escapeHtml(pending.tx_ref)}</strong></div><div class="receipt-row"><span>Amount</span><strong>${money(pending.amount)}</strong></div></div><div class="modal-actions"><button class="button button-dark" type="button" data-action="retry-guest">Retry checkout <span>↗</span></button></div>` });
  } catch { localStorage.removeItem('pudata_pending_guest_purchase'); }
}

async function loadAdminData() {
  if (!supabaseClient || !state.isAdmin) return;
  state.admin.loading = true;
  state.admin.error = '';
  render();
  const [users, transactions, statsTransactions, pricing, announcements, support, userCount] = await Promise.all([
    supabaseClient.from('profiles').select('id,email,full_name,role,suspended,created_at').order('created_at', { ascending: false }).limit(100),
    supabaseClient.from('transactions').select('id,client_reference,user_id,guest_email,service_type,status,amount,margin_amount,pulseflow_ref,created_at,failure_reason').order('created_at', { ascending: false }).limit(200),
    fetchAllRows('transactions', 'amount,margin_amount,status'),
    supabaseClient.from('pricing_rules').select('id,scope,service_id,category_id,product_id,margin_type,margin_value,active').order('created_at', { ascending: false }),
    supabaseClient.from('announcements').select('id,title,body,active,published_at').order('published_at', { ascending: false }).limit(50),
    supabaseClient.from('support_settings').select('whatsapp_url,support_email,updated_at').eq('id', true).maybeSingle(),
    supabaseClient.from('profiles').select('id', { count: 'exact', head: true })
  ]);
  state.admin.users = users.data || [];
  state.admin.transactions = transactions.data || [];
  state.admin.statsTransactions = statsTransactions.data || [];
  state.admin.pricing = pricing.data || [];
  state.admin.announcements = announcements.data || [];
  state.admin.support = support.data || null;
  state.admin.userCount = userCount.count || 0;
  state.admin.error = users.error?.message || transactions.error?.message || statsTransactions.error?.message || pricing.error?.message || announcements.error?.message || support.error?.message || userCount.error?.message || '';
  state.admin.loading = false;
  render();
}

async function fetchAllRows(table, columns) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const result = await supabaseClient.from(table).select(columns).range(start, start + 999);
    if (result.error) return { data: rows, error: result.error };
    rows.push(...(result.data || []));
    if (!result.data || result.data.length < 1000) return { data: rows, error: null };
  }
}
function renderAdmin() {
  if (!state.isAdmin) return renderDashboard();
  if (state.admin.loading) return '<section class="dashboard-head"><h1>Admin</h1><p>Loading live records…</p></section><div class="empty-state">Loading live data.</div>';
  const txs = state.admin.transactions.filter((t) => (!state.admin.statusFilter || t.status === state.admin.statusFilter) && (!state.admin.referenceFilter || `${t.client_reference} ${t.pulseflow_ref || ''}`.toLowerCase().includes(state.admin.referenceFilter.toLowerCase())));
  const attention = state.admin.transactions.filter((t) => ['pending', 'failed', 'reversed', 'refund_pending'].includes(t.status));
  const allTxs = state.admin.statsTransactions;
  const sales = allTxs.filter((t) => t.status === 'success').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const profit = allTxs.filter((t) => t.status === 'success').reduce((sum, t) => sum + Number(t.margin_amount || 0), 0);
  const pending = allTxs.filter((t) => t.status === 'pending').length;
  const failed = allTxs.filter((t) => ['failed', 'reversed', 'refund_pending'].includes(t.status)).length;
  const error = state.admin.error ? `<div class="notice">${escapeHtml(state.admin.error)}</div>` : '';
  const users = state.admin.users.length ? `<div class="admin-card"><table class="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>${state.admin.users.map((u) => `<tr><td>${escapeHtml(u.full_name || '—')}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.role)}</td><td>${u.suspended ? 'Suspended' : 'Active'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><strong>No users found</strong></div>';
  const transactions = txs.length ? `<div class="admin-card"><table class="admin-table"><thead><tr><th>Reference</th><th>Service</th><th>Amount</th><th>Status</th><th>PulseFlow</th><th>Actions</th></tr></thead><tbody>${txs.map((t) => `<tr><td>${escapeHtml(t.client_reference)}</td><td>${escapeHtml(t.service_type)}</td><td>${money(t.amount)}</td><td>${escapeHtml(t.status)}</td><td>${escapeHtml(t.pulseflow_ref || '—')}</td><td><button class="text-button" data-admin-action="recheck" data-reference="${escapeHtml(t.client_reference)}">Re-check</button>${['pending', 'failed', 'reversed', 'refund_pending'].includes(t.status) ? `<button class="text-button" data-admin-action="mark-failed" data-id="${t.id}">Mark failed</button><button class="text-button" data-admin-action="refund" data-reference="${escapeHtml(t.client_reference)}">Refund</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><strong>No transactions found</strong></div>';
  const pricing = state.admin.pricing.length ? `<div class="admin-card"><table class="admin-table"><thead><tr><th>Scope</th><th>Target</th><th>Margin</th><th>Status</th></tr></thead><tbody>${state.admin.pricing.map((r) => `<tr><td>${escapeHtml(r.scope)}</td><td>${escapeHtml(r.product_id || r.category_id || r.service_id || '—')}</td><td>${escapeHtml(r.margin_type)} ${escapeHtml(r.margin_value)}</td><td>${r.active ? 'Active' : 'Inactive'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><strong>No pricing rules found</strong></div>';
  const announcements = state.admin.announcements.length ? `<div class="admin-list">${state.admin.announcements.map((a) => `<div class="notice"><strong>${escapeHtml(a.title)}</strong><br />${escapeHtml(a.body)}</div>`).join('')}</div>` : '<div class="empty-state"><strong>No announcements found</strong></div>';
  const support = state.admin.support || {};
  return `<section class="dashboard-head"><div class="date-line">Operations</div><h1>Admin</h1><p>Live records and controls for pudata.</p></section>${error}<section class="section"><div class="admin-grid"><div class="metric"><span>Total users</span><strong>${state.admin.userCount}</strong></div><div class="metric"><span>Total sales</span><strong>${money(sales)}</strong></div><div class="metric"><span>Total profit</span><strong>${money(profit)}</strong></div><div class="metric"><span>Pending / failed</span><strong>${pending} / ${failed}</strong></div></div></section><section class="section"><div class="section-heading"><div><h2>Users</h2><p>Live profile records.</p></div></div>${users}</section><section class="section"><div class="section-heading"><div><h2>Transactions</h2><p>Latest live transaction records.</p></div></div><div class="admin-toolbar"><select class="admin-filter" id="admin-status-filter" aria-label="Filter transactions by status"><option value="">All statuses</option><option value="pending" ${state.admin.statusFilter === 'pending' ? 'selected' : ''}>Pending</option><option value="success" ${state.admin.statusFilter === 'success' ? 'selected' : ''}>Success</option><option value="failed" ${state.admin.statusFilter === 'failed' ? 'selected' : ''}>Failed</option></select><input class="admin-filter" id="admin-reference-filter" value="${escapeHtml(state.admin.referenceFilter)}" aria-label="Filter by reference or PulseFlow reference" /></div>${transactions}</section><section class="section"><div class="section-heading"><div><h2>Pending / Failed</h2><p>Transactions needing an operational decision.</p></div></div>${attention.length ? `<div class="transaction-list">${attention.map((t) => `<div class="transaction-row"><div><strong>${escapeHtml(t.client_reference)}</strong><span>${escapeHtml(t.service_type)} · ${escapeHtml(t.status)}</span></div><div><button class="text-button" data-admin-action="recheck" data-reference="${escapeHtml(t.client_reference)}">Re-check</button><button class="text-button" data-admin-action="refund" data-reference="${escapeHtml(t.client_reference)}">Refund</button></div></div>`).join('')}</div>` : '<div class="empty-state"><strong>No pending or failed transactions</strong></div>'}</section><section class="section"><div class="section-heading"><div><h2>Pricing</h2><p>Margins from live pricing rules.</p></div></div>${pricing}<div class="admin-toolbar"><button class="button button-dark" data-admin-action="refresh-catalogue">Refresh catalogue</button></div></section><section class="section"><div class="section-heading"><div><h2>Announcements</h2><p>Published notices from Supabase.</p></div></div>${announcements}</section><section class="section"><div class="section-heading"><div><h2>Support settings</h2><p>Customer support contact.</p></div></div><div class="notice">${escapeHtml(support.support_email || supportEmail)}${support.whatsapp_url ? ` · <a href="${escapeHtml(support.whatsapp_url)}" target="_blank" rel="noreferrer">WhatsApp</a>` : ''}</div></section>`;
}
async function handleAdminAction(target) {
  const action = target.dataset.adminAction;
  try {
    if (action === 'recheck') await invokeFunction('recheck-transaction', { reference: target.dataset.reference });
    if (action === 'refund') await invokeFunction('admin-refund', { reference: target.dataset.reference, reason: 'Admin-approved refund' });
    if (action === 'mark-failed') {
      const { error } = await supabaseClient.from('transactions').update({ status: 'failed', failure_reason: 'Marked failed by admin' }).eq('id', target.dataset.id);
      if (error) throw error;
    }
    if (action === 'refresh-catalogue') {
      const result = await invokeFunction('refresh-catalogue', {});
      showToast(`Catalogue refreshed: ${result.services || 0} services, ${result.categories || 0} categories, ${result.products || 0} products.`);
      await loadCatalogue();
    }
    await loadAdminData();
  } catch (error) {
    showToast(error.message || 'The admin action failed.');
  }
}

function navigate(path) {
  closeDrawer();
  closeModal();
  window.history.pushState({}, '', path);
  state.route = path;
  render();
  if (path === '/admin') loadAdminData();
}

function purchaseParameters(form, kind) {
  if (kind === 'airtime') return { phone_number: $('#phone', form).value.trim(), amount: Number($('#amount', form).value) };
  if (kind === 'data') return { phone_number: $('#phone', form).value.trim() };
  if (kind === 'tv') return { smart_card_number: $('#smart-card', form).value.trim() };
  return { quantity: Number($('#quantity', form).value) };
}

async function handleSubmit(form) {
  if (form.id === 'auth-form') {
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    const signup = form.dataset.mode === 'signup';
    const result = signup ? await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: $('#auth-name').value.trim() } } }) : await supabaseClient.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    await syncSession();
    closeModal();
    showToast(signup ? 'Account created. Check your email if confirmation is enabled.' : 'You are signed in.');
  }
  if (form.id === 'fund-form') {
    const amount = Number($('#fund-amount').value);
    const txRef = walletFundingRef();
    closeModal();
    launchFlutterwave({ amount, txRef, email: state.user.email, onSuccess: async (response) => {
      if (!['successful', 'completed'].includes(response?.status)) return showToast('Flutterwave did not confirm this payment.');
      try {
        const result = await invokeFunction('flutterwave-verify', { tx_ref: txRef, expected_amount: amount, purpose: 'wallet_funding' });
        if (!result.verified || !result.credited) throw new Error('Payment was not verified. The wallet was not changed.');
        await loadUserData();
        render();
        showToast('Wallet balance refreshed.');
      } catch (error) { showToast(error.message); }
    } });
  }
  if (form.id === 'purchase-form') {
    const kind = form.dataset.kind;
    const type = form.dataset.type;
    const product = state.products.find((item) => item.id === $('#product', form).value);
    const parameters = purchaseParameters(form, kind);
    const amount = kind === 'airtime' ? parameters.amount : Number(product?.selling_price || 0);
    if (kind === 'airtime' && amount < 50) throw new Error('Airtime amount must be at least ₦50.');
    if (!product) throw new Error('Choose an available catalogue product.');
    if (state.user) {
      const result = await invokeFunction('create-purchase', { product_id: product.id, parameters });
      await loadUserData();
      render();
      closeModal();
      openModal({ kicker: 'RECEIPT', title: result.status === 'pending' ? 'Payment pending' : 'Payment complete', intro: 'Keep this reference for support.', body: `<div class="receipt"><div class="receipt-row"><span>Reference</span><strong>${escapeHtml(result.reference || '—')}</strong></div><div class="receipt-row"><span>Status</span><strong>${escapeHtml(result.status || 'pending')}</strong></div></div>` });
      return;
    }
    const email = $('#email', form).value.trim();
    const pending = { product_id: product.id, kind, type, amount, email, parameters, tx_ref: `PUD_${new Date().getFullYear()}_${randomPart()}` };
    localStorage.setItem('pudata_pending_guest_purchase', JSON.stringify(pending));
    closeModal();
    launchFlutterwave({ amount, txRef: pending.tx_ref, email, onSuccess: async (response) => {
      if (!['successful', 'completed'].includes(response?.status)) return showToast('Flutterwave did not confirm this payment.');
      try { await completeGuestPurchase(pending); } catch { showToast(`Fulfilment needs a retry with ${pending.tx_ref}.`); }
    } });
  }
}

function handleAction(action, target) {
  if (action === 'profile') showProfile();
  if (action === 'login') showAuth('login');
  if (action === 'signup') showAuth('signup');
  if (action === 'logout') { supabaseClient?.auth.signOut(); state.user = null; state.profile = null; state.wallet = null; state.transactions = []; state.isAdmin = false; closeModal(); render(); showToast('You are signed out.'); }
  if (action === 'fund-wallet') showFundWallet();
  if (action === 'history') showHistory();
  if (action === 'help') showHelp();
  if (action === 'more') openDrawer();
  if (action === 'close-menu') closeDrawer();
  if (action === 'close-modal') closeModal();
  if (action === 'toggle-services') { state.showAllServices = !state.showAllServices; render(); }
  if (action === 'service') showPurchase(target.dataset.service);
  if (action === 'refresh-wallet') loadUserData().then(render);
  if (action === 'retry-guest') {
    const pending = JSON.parse(localStorage.getItem('pudata_pending_guest_purchase') || 'null');
    if (pending) { closeModal(); launchFlutterwave({ amount: pending.amount, txRef: pending.tx_ref, email: pending.email, onSuccess: async (response) => { if (['successful', 'completed'].includes(response?.status)) { try { await completeGuestPurchase(pending); } catch { showToast(`Fulfilment needs a retry with ${pending.tx_ref}.`); } } } }); }
  }
}

document.addEventListener('click', (event) => {
  const routeTarget = event.target.closest('[data-route]');
  if (routeTarget) { event.preventDefault(); navigate(routeTarget.dataset.route); return; }
  const adminTarget = event.target.closest('[data-admin-action]');
  if (adminTarget) { event.preventDefault(); handleAdminAction(adminTarget); return; }
  const actionTarget = event.target.closest('[data-action]');
  if (actionTarget) handleAction(actionTarget.dataset.action, actionTarget);
});
document.addEventListener('submit', (event) => { event.preventDefault(); handleSubmit(event.target).catch((error) => showToast(error.message || 'Something went wrong.')); });
document.addEventListener('change', (event) => {
  if (event.target.id === 'admin-status-filter') {
    state.admin.statusFilter = event.target.value;
    render();
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'admin-reference-filter') {
    state.admin.referenceFilter = event.target.value;
    render();
    const input = $('#admin-reference-filter');
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }
});
window.addEventListener('popstate', () => { state.route = window.location.pathname; render(); if (state.route === '/admin') loadAdminData(); });

syncSession().then(() => { if (state.route === '/admin' && state.isAdmin) loadAdminData(); });
