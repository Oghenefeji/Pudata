const runtimeConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  flutterwavePublicKey: import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY || '',
  appUrl: import.meta.env.VITE_APP_URL || '',
  supportWhatsappUrl: import.meta.env.VITE_SUPPORT_WHATSAPP_URL || ''
};

const supportEmail = 'teamfeji4@gmail.com';
const FUNDING_FEE = 20;
const FUNDING_PRESETS = [500, 1000, 2000, 5000];
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
  categories: [],
  isAdmin: false,
  showAllServices: false,
  dataValidity: 'Daily',
  dataConfirmProductId: '',
  route: window.location.pathname || '/',
  admin: {
    loading: false, users: [], transactions: [], statsTransactions: [], pricing: [], announcements: [], support: null,
    products: [], costs: {}, userCount: 0, error: '', statusFilter: '', referenceFilter: '', productSearch: '', productService: '', productPage: 1,
    marginType: 'percentage', marginValue: '', syncMessage: ''
  }
};

const serviceCards = [
  { kind: 'airtime', type: 'airtime', title: 'Airtime', icon: 'phone', tint: 'peach' },
  { kind: 'data', type: 'data', title: 'Data', icon: 'wifi', tint: 'blue' },
  { kind: 'tv', type: 'tv', title: 'Cable', icon: 'tv', tint: 'pink' },
  { kind: 'electricity', type: 'electricity', title: 'Electricity', icon: 'bolt', tint: 'purple' },
  { kind: 'education', type: 'education', title: 'Education pins', icon: 'cap', tint: 'mint' },
  { kind: 'data_card', type: 'data_card', title: 'Data card pins', icon: 'card', tint: 'yellow' },
  { kind: 'recharge_card', type: 'recharge_card', title: 'Recharge card pins', icon: 'recharge', tint: 'mint' }
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const money = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
const dateText = (value) => value ? new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const firstName = () => (state.profile?.full_name || state.user?.email?.split('@')[0] || '').trim().split(/\s+/)[0];
const randomPart = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
const metadataValue = (product, keys) => keys.map((key) => product.metadata?.[key]).find(Boolean) || '';
let activePaymentWatch = null;

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
  stopPaymentWatch();
  $('#modal-layer').classList.remove('is-open');
  $('#modal-layer').setAttribute('aria-hidden', 'true');
}
function openDrawer() { document.body.classList.add('drawer-open'); $('#drawer').setAttribute('aria-hidden', 'false'); }
function closeDrawer() { document.body.classList.remove('drawer-open'); $('#drawer').setAttribute('aria-hidden', 'true'); }
async function invokeFunction(name, body) {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data, error } = await supabaseClient.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

async function loadCatalogue() {
  if (!supabaseClient) return;
  const [products, categories] = await Promise.all([
    supabaseClient.from('catalogue_products').select('id,service_id,category_id,name,description,product_type,selling_price,active,metadata').order('name'),
    supabaseClient.from('catalogue_categories').select('id,service_id,name,logo,active').eq('active', true).order('name')
  ]);
  if (!products.error) state.products = products.data || [];
  if (!categories.error) state.categories = categories.data || [];
}

async function loadUserData() {
  if (!supabaseClient || !state.user) {
    state.profile = null; state.wallet = null; state.transactions = []; state.isAdmin = false; return;
  }
  const [profileResult, walletResult, transactionResult] = await Promise.all([
    supabaseClient.from('profiles').select('id,email,full_name,phone,avatar_url,role,suspended,created_at').eq('id', state.user.id).single(),
    supabaseClient.from('wallets').select('balance,currency,updated_at').eq('user_id', state.user.id).single(),
    supabaseClient.from('transactions').select('id,client_reference,service_type,status,amount,currency,pulseflow_ref,created_at,updated_at,pin_payload,failure_reason').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(50)
  ]);
  state.profile = profileResult.data || null;
  state.wallet = walletResult.data || { balance: 0, currency: 'NGN' };
  state.transactions = transactionResult.data || [];
  state.isAdmin = Boolean(state.profile && !state.profile.suspended && ['admin', 'support'].includes(state.profile.role));
}

async function syncSession() {
  if (!supabaseClient) { render(); return; }
  const { data } = await supabaseClient.auth.getSession();
  state.session = data.session; state.user = data.session?.user || null;
  await Promise.all([loadUserData(), loadCatalogue()]);
  render();
  if (state.route === '/admin' && state.isAdmin) await loadAdminData();
  await retryPendingGuestPurchase();
}

const FIXED_PRICE_TYPES = new Set(['data', 'tv', 'education', 'data_card', 'recharge_card']);
function activeServiceProducts(type) { return state.products.filter((product) => product.product_type === type && product.active); }
function serviceProducts(type) { return activeServiceProducts(type).filter((product) => !FIXED_PRICE_TYPES.has(type) || Number(product.selling_price) > 0); }
function serviceIsAvailable(card) { return serviceProducts(card.type).length > 0; }
function productNetwork(product, type) {
  const category = state.categories.find((item) => item.id === product.category_id);
  return metadataValue(product, type === 'tv' ? ['provider', 'network', 'operator'] : ['network', 'provider', 'operator', 'distribution_company', 'disco']) || category?.name || product.name.split(/\s+/)[0] || 'Other';
}
function productLabel(product, type) { return `${productNetwork(product, type)} · ${product.name}`; }
const NETWORK_PREFIXES = {
  MTN: ['0703', '0706', '0803', '0806', '0810', '0813', '0814', '0816', '0903', '0906', '0913', '0916', '0704'],
  Airtel: ['0701', '0708', '0802', '0808', '0812', '0901', '0902', '0904', '0907', '0912'],
  Glo: ['0705', '0805', '0807', '0811', '0815', '0905', '0915'],
  '9mobile': ['0809', '0817', '0818', '0908', '0909']
};
function normalizePhone(value) { const digits = String(value || '').replace(/\D/g, ''); return digits.startsWith('234') ? `0${digits.slice(3)}` : digits; }
function detectNetwork(value) { const prefix = normalizePhone(value).slice(0, 4); return Object.entries(NETWORK_PREFIXES).find(([, prefixes]) => prefixes.includes(prefix))?.[0] || ''; }
function normalizeNetwork(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function networkMatches(value, detected) { const actual = normalizeNetwork(value); const wanted = normalizeNetwork(detected); return actual === wanted || actual.includes(wanted) || wanted.includes(actual); }
function networkChoices(type) { return [...new Set(serviceProducts(type).map((product) => productNetwork(product, type)))].sort(); }
function networkCategory(network) { return state.categories.find((category) => networkMatches(category.name, network)); }
function networkLogoMarkup(network) { const logo = networkCategory(network)?.logo; return logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(network)} logo" />` : `<span>${escapeHtml(String(network || '?').slice(0, 2).toUpperCase())}</span>`; }
function iconSvg(icon) {
  const paths = {
    phone: '<path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M10 18h4"/>',
    wifi: '<path d="M3 9a13 13 0 0 1 18 0"/><path d="M6 12a9 9 0 0 1 12 0"/><path d="M9 15a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
    tv: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="m8 21 4-3 4 3"/>',
    bolt: '<path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z"/>',
    cap: '<path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M7 12v5c3 2 5 2 10 0v-5"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    recharge: '<path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h5"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[icon] || paths.card}</svg>`;
}
function avatarMarkup(size = '') {
  return state.profile?.avatar_url ? `<img class="avatar-image ${size}" src="${escapeHtml(state.profile.avatar_url)}" alt="Profile picture" />` : `<span>${escapeHtml((firstName()[0] || 'G').toUpperCase())}</span>`;
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
    return `<button class="service-card ${available ? '' : 'is-disabled'}" type="button" ${available ? `data-action="service" data-service="${card.kind}"` : 'disabled'}><span class="service-icon icon-${card.tint}">${iconSvg(card.icon)}</span><span><strong class="service-title">${card.title}</strong><small class="service-status">${available ? 'Available' : 'Coming soon'}</small></span></button>`;
  }).join('');
  const transactions = state.user ? state.transactions.slice(0, 5) : [];
  const transactionHtml = !state.user ? '<div class="empty-state"><strong>No transactions yet</strong>Log in to see your payment history, or keep using guest checkout and save each receipt reference.</div>' : transactions.length ? `<div class="transaction-list">${transactions.map(transactionRow).join('')}</div>` : '<div class="empty-state"><strong>No transactions yet</strong>Your completed and pending payments will appear here.</div>';
  return `<section class="dashboard-head"><div class="date-line">${now.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div><h1>${greeting}</h1><p>Pay for the things that keep your day moving.</p></section><section class="wallet-card">${walletContent}</section><section class="section"><div class="section-heading"><div><h2>Services</h2><p>Choose a service to get started.</p></div><button class="text-button" type="button" data-action="toggle-services">${state.showAllServices ? 'See less ↑' : 'See more ↓'}</button></div><div class="service-grid">${servicesHtml}</div></section><section class="section"><div class="section-heading"><div><h2>History</h2><p>${state.user ? 'Your latest payment activity.' : 'Your payment trail lives here after login.'}</p></div><button class="text-button" type="button" data-action="history">View all</button></div>${transactionHtml}</section>`;
}
function transactionRow(transaction) { return `<div class="transaction-row"><div><strong>${escapeHtml(transaction.service_type)}</strong><span>${escapeHtml(transaction.client_reference)} · ${dateText(transaction.created_at)}</span></div><div><span class="status-pill">${escapeHtml(transaction.status)}</span><strong>${money(transaction.amount)}</strong></div></div>`; }
function renderLegal(kind) {
  const terms = kind === 'terms';
  return `<article class="legal-page"><button class="text-button" type="button" data-route="/">← Back home</button><h1>${terms ? 'Terms of Service' : 'Privacy Policy'}</h1><p>Last updated: 10 November 2026</p>${terms ? `<h2>About pudata</h2><p>pudata is founded and operated by Lodjie Oghenefejiro. It helps customers buy airtime and data, pay for cable TV and obtain digital pins through third-party suppliers.</p><h2>Accounts and wallet use</h2><p>You are responsible for keeping your account details secure and providing accurate customer information. Wallet funds may be used for active services and are reflected in your account balance.</p><h2>Prices, payments, and delivery</h2><p>Prices and applicable fees are shown before payment and may change when supplier prices change. Payments are processed by Flutterwave. An order can remain pending while a supplier response is being checked.</p><h2>Refunds</h2><p>Failed wallet purchases are returned automatically when the failure is clear. Delivered digital products and completed top-ups are not refundable.</p><h2>Contact</h2><p>Questions can be sent to <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>` : `<h2>What we collect</h2><p>We may collect your email, phone numbers, profile details, transaction details, and device or usage data needed to operate and protect pudata.</p><h2>Why we collect it</h2><p>We use information to create accounts, process payments, deliver services, prevent fraud, provide support, keep receipts, and improve reliability.</p><h2>Who receives it</h2><p>We share only what is needed with Flutterwave and our service suppliers to process a payment or deliver a service. We do not store card details.</p><h2>Your rights</h2><p>You may request access, correction, or deletion of your information by emailing <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>`}</article>`;
}
function renderProfile() {
  if (!state.user) return renderDashboard();
  return `<section class="profile-page"><button class="text-button" type="button" data-route="/">← Back home</button><div class="profile-hero"><div class="profile-avatar-large">${avatarMarkup('large')}</div><div><div class="date-line">Profile</div><h1>${escapeHtml(firstName())}</h1><p>${escapeHtml(state.user.email)}</p></div></div><form class="modal-form profile-form" id="profile-form"><div class="field"><label for="profile-name">Full name</label><input id="profile-name" value="${escapeHtml(state.profile?.full_name || '')}" required /></div><div class="field"><label for="profile-phone">Phone number</label><input id="profile-phone" inputmode="tel" value="${escapeHtml(state.profile?.phone || '')}" /></div><div class="field"><label for="avatar-file">Profile picture</label><input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" /><small class="field-help">JPG, PNG or WEBP. Maximum 2MB.</small></div><div class="profile-picture-actions">${state.profile?.avatar_url ? '<button class="button button-outline" type="button" data-action="remove-avatar">Remove picture</button>' : ''}<button class="button button-dark" type="submit">Save profile <span>↗</span></button></div></form><div class="profile-danger"><button class="button button-outline" type="button" data-action="logout">Log out</button></div></section>`;
}
function updateChrome() {
  $('[data-avatar]').innerHTML = avatarMarkup();
  const drawer = $('#drawer-links');
  drawer.innerHTML = `<button type="button" data-action="profile"><span>◎</span> Profile</button><button type="button" data-action="help"><span>?</span> Help centre</button><button type="button" data-route="/terms"><span>§</span> Terms of Service</button><button type="button" data-route="/privacy"><span>⌁</span> Privacy Policy</button>${state.isAdmin ? '<button type="button" data-route="/admin"><span>⌂</span> Admin</button>' : ''}${state.user ? '<button type="button" data-action="logout"><span>↪</span> Log out</button>' : ''}`;
  $$('.bottom-nav-item').forEach((item) => item.classList.toggle('active', item.dataset.route === state.route || (state.route === '/admin' && item.dataset.action === 'more')));
}
function render() {
  state.route = window.location.pathname || '/';
  if (state.route === '/admin' && !state.isAdmin) { window.history.replaceState({}, '', '/'); state.route = '/'; }
  if (state.route === '/profile' && !state.user) { window.history.replaceState({}, '', '/'); state.route = '/'; }
  const content = $('#page-content');
  if (state.route === '/terms' || state.route === '/privacy') content.innerHTML = renderLegal(state.route.slice(1));
  else if (state.route === '/profile') content.innerHTML = renderProfile();
  else if (state.route === '/airtime') content.innerHTML = renderAirtimePage();
  else if (state.route === '/data') content.innerHTML = renderDataPage();
  else if (state.route === '/admin') content.innerHTML = state.isAdmin ? renderAdmin() : renderDashboard();
  else content.innerHTML = renderDashboard();
  updateChrome();
}

function showAuth(mode = 'login') {
  const signup = mode === 'signup';
  openModal({ kicker: 'ACCOUNT', title: signup ? 'Create your account' : 'Log in to pudata', intro: signup ? 'Save your wallet, receipts, and payment history in one place.' : 'Use your pudata account to fund a wallet and see your history.', body: `<form class="modal-form" id="auth-form" data-mode="${signup ? 'signup' : 'login'}"><div class="field"><label for="auth-email">Email address</label><input id="auth-email" type="email" required /></div>${signup ? '<div class="field"><label for="auth-name">Full name</label><input id="auth-name" type="text" required /></div>' : ''}<div class="field"><label for="auth-password">Password</label><input id="auth-password" type="password" minlength="6" required /></div>${signup ? '<p class="modal-quiet">By signing up you agree to the Terms of Service and Privacy Policy.</p>' : ''}<div class="modal-actions"><button class="button button-dark" type="submit">${signup ? 'Sign up' : 'Log in'} <span>↗</span></button></div><button class="text-button" type="button" data-action="${signup ? 'login' : 'signup'}">${signup ? 'Already have an account? Log in' : 'Create an account'}</button></form>` });
}
function showHelp() {
  const whatsapp = runtimeConfig.supportWhatsappUrl ? `<a class="button button-dark" href="${escapeHtml(runtimeConfig.supportWhatsappUrl)}" target="_blank" rel="noreferrer">WhatsApp support ↗</a>` : '<span class="notice">WhatsApp support link is not configured yet.</span>';
  openModal({ kicker: 'HELP CENTRE', title: 'How can we help?', intro: `Email ${supportEmail} for support.`, body: `<div class="admin-list"><div class="notice"><strong>Pending order</strong><br />Keep the original reference. Do not pay again with a new reference.</div><div class="notice"><strong>Failed purchase</strong><br />Wallet purchases are returned automatically when the failure is clear.</div><div class="notice"><strong>Wallet funding</strong><br />Funding is credited only after Flutterwave verification.</div></div><div class="modal-actions"><a class="button button-outline" href="mailto:${supportEmail}">Email support ↗</a>${whatsapp}</div>` });
}
function receiptDetailsMarkup(details) {
  if (!details) return '';
  const entries = [];
  const walk = (value, path) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return Object.entries(value).forEach(([key, child]) => walk(child, path ? `${path}.${key}` : key));
    if (value !== null && value !== undefined && value !== '') entries.push([path || 'details', String(value)]);
  };
  walk(details, '');
  const rows = entries.map(([key, text]) => {
    const isToken = /token/i.test(key);
    return `<div class="receipt-row receipt-detail-row"><span>${escapeHtml(key.replace(/\./g, ' · ').replace(/_/g, ' '))}</span><strong>${escapeHtml(text)}</strong>${isToken ? `<button class="text-button copy-token" type="button" data-copy-token="${escapeHtml(text)}">Copy</button>` : ''}</div>`;
  }).join('');
  return rows ? `<div class="receipt-details"><h3>Service details</h3>${rows}</div>` : '';
}
function renderReceiptResult(result, fallbackAmount = 0) {
  const details = result.details || result.pins || null;
  const status = String(result.status || 'pending');
  const service = serviceDisplayName(result.service || result.service_type || '—');
  const pendingMessage = status === 'pending' ? '<div class="pending-message">Processing. Do not pay again. We\'ll update this screen.</div>' : '';
  return `<div class="receipt">${pendingMessage}<div class="receipt-rows"><div class="receipt-row"><span>Reference</span><strong>${escapeHtml(result.reference || result.client_reference || '—')}</strong></div><div class="receipt-row"><span>Status</span><strong>${escapeHtml(status)}</strong></div><div class="receipt-row"><span>Service</span><strong>${escapeHtml(service)}</strong></div>${result.network ? `<div class="receipt-row"><span>Network</span><strong>${escapeHtml(result.network)}</strong></div>` : ''}${result.number ? `<div class="receipt-row"><span>Number</span><strong>${escapeHtml(result.number)}</strong></div>` : ''}<div class="receipt-row"><span>Amount</span><strong>${money(result.amount ?? fallbackAmount)}</strong></div></div>${receiptDetailsMarkup(details)}<button class="button button-outline" type="button" data-action="guest-receipt-lookup">Look up another receipt</button></div>`;
}
function stopPaymentWatch() {
  if (!activePaymentWatch) return;
  if (activePaymentWatch.interval) clearInterval(activePaymentWatch.interval);
  if (activePaymentWatch.channel && supabaseClient) supabaseClient.removeChannel(activePaymentWatch.channel);
  activePaymentWatch = null;
}
function receiptStatusTitle(status) { return status === 'success' ? 'Success' : status === 'pending' ? 'Processing' : `Payment ${status || 'failed'}`; }
function showReceipt(result, fallbackAmount = 0, context = {}) {
  stopPaymentWatch();
  const merged = { ...context, ...result, service: result.service || context.service, network: result.network || context.network, number: result.number || context.number };
  openModal({ kicker: 'RECEIPT', title: receiptStatusTitle(merged.status), intro: merged.status === 'pending' ? '' : 'Keep this reference for support or receipt lookup.', body: renderReceiptResult(merged, fallbackAmount) });
  if (merged.status === 'pending' && merged.reference) {
    if (merged.guestEmail) startGuestPaymentWatch(merged.reference, merged.guestEmail, fallbackAmount, context);
    else startRealtimePaymentWatch(merged.reference, fallbackAmount, context);
  }
}
async function fetchGuestReceipt(reference, email) { return invokeFunction('guest-receipt', { reference, email }); }
function startRealtimePaymentWatch(reference, fallbackAmount, context) {
  if (!supabaseClient || !state.user) return;
  const channel = supabaseClient.channel(`pudata-payment-${reference}`).on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `client_reference=eq.${reference}` }, async (payload) => {
    const row = payload.new || {};
    const result = { ...row, reference: row.client_reference || reference, service: row.service_type, details: row.pin_payload };
    showReceipt(result, fallbackAmount, context);
  }).subscribe();
  activePaymentWatch = { channel };
}
function startGuestPaymentWatch(reference, email, fallbackAmount, context) {
  const startedAt = Date.now();
  const poll = async () => {
    if (Date.now() - startedAt >= 10 * 60 * 1000) return stopPaymentWatch();
    try {
      const result = await fetchGuestReceipt(reference, email);
      if (result.status !== 'pending') showReceipt({ ...result, guestEmail: email }, fallbackAmount, context);
    } catch { /* Keep the pending screen; the next ten-second poll can recover. */ }
  };
  const interval = setInterval(poll, 10000);
  activePaymentWatch = { interval };
}
function showGuestReceiptLookup() {
  openModal({ kicker: 'RECEIPT LOOKUP', title: 'Find a guest receipt', intro: 'Use the original reference and the email used at checkout.', body: '<form class="modal-form" id="guest-receipt-form"><div class="field"><label for="receipt-reference">Reference</label><input id="receipt-reference" required /></div><div class="field"><label for="receipt-email">Receipt email</label><input id="receipt-email" type="email" required /></div><div class="modal-actions"><button class="button button-dark" type="submit">Find receipt <span>↗</span></button></div></form>' });
}
function showHistory() { openModal({ kicker: 'HISTORY', title: 'Your transactions', intro: state.user ? 'Live records from your account.' : 'Log in to see your account history.', body: state.user ? (state.transactions.length ? `<div class="transaction-list">${state.transactions.map(transactionRow).join('')}</div>` : '<div class="empty-state"><strong>No transactions yet</strong>Your payment activity will appear here.</div>') : '<div class="empty-state"><strong>No transactions yet</strong><button class="button button-dark" type="button" data-action="login">Log in</button><button class="button button-outline" type="button" data-action="guest-receipt-lookup">Look up guest receipt</button></div>' }); }

const DATA_VALIDITY_TABS = ['Daily', 'Weekly', 'Monthly', 'Others'];
function dataValidity(product) {
  const value = String(metadataValue(product, ['valid_for', 'validity', 'validity_period']) || '').trim();
  const lower = value.toLowerCase();
  return lower.includes('day') && !lower.includes('week') && !lower.includes('month') ? 'Daily' : lower.includes('week') ? 'Weekly' : lower.includes('month') ? 'Monthly' : 'Others';
}
function dataValidityLabel(product) { return String(metadataValue(product, ['valid_for', 'validity', 'validity_period']) || dataValidity(product)); }
function dataPlanSize(product) { return String(metadataValue(product, ['data_size', 'size', 'volume', 'allowance', 'plan_size']) || product.name); }
function renderAirtimePage() {
  const tiles = [100, 200, 300, 400, 500, 1000].map((amount) => `<button class="amount-tile" type="button" data-action="airtime-amount" data-amount="${amount}">₦${amount.toLocaleString('en-NG')}</button>`).join('');
  return `<section class="service-page"><div class="service-page-top"><button class="back-button" type="button" data-route="/" aria-label="Back">←</button><h1>Airtime</h1><button class="text-button" type="button" data-action="history">History</button></div><form id="purchase-form" class="service-purchase-form" data-kind="airtime" data-type="airtime">${phoneNetworkField('airtime')}<input id="product" type="hidden" data-role="product" /><div class="field"><label>Choose amount</label><div class="amount-grid">${tiles}</div></div><div class="field"><label for="amount">Custom amount</label><div class="amount-input-wrap"><span>₦</span><input id="amount" type="number" min="50" step="1" inputmode="decimal" placeholder="Enter amount" required /></div><small class="field-help">Minimum ₦50.</small></div>${!state.user ? '<div class="field"><label for="email">Receipt email</label><input id="email" type="email" required /></div>' : ''}<button class="button button-dark service-pay-button" type="submit">Pay <span>↗</span></button></form></section>`;
}
function renderDataPage() {
  const tabs = DATA_VALIDITY_TABS.map((tab) => `<button class="validity-tab ${state.dataValidity === tab ? 'active' : ''}" type="button" data-action="data-validity" data-validity="${tab}">${tab}</button>`).join('');
  return `<section class="service-page"><div class="service-page-top"><button class="back-button" type="button" data-route="/" aria-label="Back">←</button><h1>Data</h1><button class="text-button" type="button" data-action="history">History</button></div><form id="purchase-form" class="service-purchase-form" data-kind="data" data-type="data">${phoneNetworkField('data')}<select id="product" data-role="product" hidden disabled></select><div class="validity-tabs">${tabs}</div><div id="data-plan-grid" class="data-plan-grid"><div class="plan-empty">Enter your phone number to see available plans.</div></div>${!state.user ? '<div class="field"><label for="email">Receipt email</label><input id="email" type="email" required /></div>' : ''}<button class="button button-dark service-pay-button sr-only" type="submit">Pay</button></form></section>`;
}
function renderDataPlans(form) {
  const grid = $('#data-plan-grid', form);
  if (!grid) return;
  const network = $('#network', form)?.value;
  if (!network) { grid.innerHTML = '<div class="plan-empty">Enter your phone number to see available plans.</div>'; return; }
  const plans = serviceProducts('data').filter((product) => networkMatches(productNetwork(product, 'data'), network) && dataValidity(product) === state.dataValidity);
  grid.innerHTML = plans.length ? plans.map((product) => `<button class="data-plan-card" type="button" data-action="data-plan" data-id="${escapeHtml(product.id)}"><strong>${escapeHtml(dataPlanSize(product))}</strong><span>${escapeHtml(dataValidityLabel(product))}</span><b>${money(product.selling_price)}</b></button>`).join('') : '<div class="plan-empty">No plans are available for this network and validity.</div>';
}
function showDataConfirm(productId) {
  const form = $('#purchase-form'); const product = state.products.find((item) => item.id === productId); const network = $('#network', form)?.value; const phone = $('#phone', form)?.value.trim();
  if (!product || !network || !phone) return showToast('Enter a valid phone number first.');
  state.dataConfirmProductId = product.id;
  openModal({ kicker: 'CONFIRM DATA', title: 'Review your plan', intro: 'Check these details before you pay.', body: `<div class="confirm-sheet"><div class="confirm-row"><span>Network</span><strong>${escapeHtml(network)}</strong></div><div class="confirm-row"><span>Number</span><strong>${escapeHtml(phone)}</strong></div><div class="confirm-row"><span>Plan</span><strong>${escapeHtml(dataPlanSize(product))} · ${escapeHtml(dataValidityLabel(product))}</strong></div><div class="confirm-row total"><span>Price</span><strong>${money(product.selling_price)}</strong></div></div><div class="modal-actions"><button class="button button-dark" type="button" data-action="confirm-data-plan">Pay ${money(product.selling_price)} <span>↗</span></button></div>` });
}

function networkOptions(type, selected = '', includePlaceholder = false) {
  const placeholder = includePlaceholder ? `<option value="">Detect network</option>` : '';
  return `${placeholder}${networkChoices(type).map((network) => `<option value="${escapeHtml(network)}" ${network === selected ? 'selected' : ''}>${escapeHtml(network)}</option>`).join('')}`;
}
function productOptions(type, network = '') {
  return serviceProducts(type).filter((product) => !network || productNetwork(product, type) === network).map((product) => `<option value="${escapeHtml(product.id)}" data-price="${Number(product.selling_price)}">${escapeHtml(product.name)}${FIXED_PRICE_TYPES.has(type) ? ` · ${money(product.selling_price)}` : ''}</option>`).join('');
}
function phoneNetworkField(type) {
  return `<div class="field"><label for="phone">Phone number</label><div class="phone-network-field"><input id="phone" data-phone-input inputmode="tel" autocomplete="tel" required /><label class="network-picker" title="Tap to change network"><span id="network-logo" class="network-logo">?</span><select id="network" data-role="network" aria-label="Network">${networkOptions(type, '', true)}</select></label></div><small id="network-help" class="field-help">Your network is detected from the number. Tap the logo to change it if your number was ported.</small></div>`;
}
function updateNetworkSelection(form, network) {
  const picker = $('#network', form);
  if (!picker) return;
  const option = [...picker.options].find((item) => networkMatches(item.value, network));
  picker.value = option?.value || '';
  const selectedNetwork = picker.value;
  const logo = $('#network-logo', form);
  if (logo) logo.innerHTML = selectedNetwork ? networkLogoMarkup(selectedNetwork) : '?';
  const productSelect = $('#product', form);
  const type = form.dataset.type;
  const products = selectedNetwork ? serviceProducts(type).filter((product) => networkMatches(productNetwork(product, type), selectedNetwork)) : [];
  if (form.dataset.kind === 'airtime') {
    if (productSelect) productSelect.value = products[0]?.id || '';
  } else if (productSelect) {
    productSelect.innerHTML = products.length ? productOptions(type, selectedNetwork) : '<option value="">Enter a valid number to see plans</option>';
    productSelect.disabled = !products.length;
  }
}
function showPurchase(kind) {
  const card = serviceCards.find((item) => item.kind === kind);
  const products = serviceProducts(card.type);
  if (!products.length) return showToast('This service is coming soon.');
  const initialNetwork = productNetwork(products[0], card.type);
  const networkField = ['tv', 'electricity'].includes(kind) ? `<div class="field"><label for="network">${kind === 'tv' ? 'Cable provider' : 'Distribution company'}</label><select id="network" data-role="network">${networkOptions(card.type, initialNetwork)}</select></div>` : '';
  const productField = kind === 'airtime' ? '<input id="product" type="hidden" data-role="product" />' : kind === 'data' ? '<div class="field"><label for="product">Plan</label><select id="product" data-role="product" data-type="data" disabled><option value="">Enter a valid number to see plans</option></select></div>' : `<div class="field"><label for="product">${kind === 'tv' ? 'Plan' : kind === 'electricity' ? 'Prepaid / Postpaid' : 'Product'}</label><select id="product" data-role="product" data-type="${card.type}">${productOptions(card.type, initialNetwork)}</select></div>`;
  const phone = kind === 'airtime' || kind === 'data' ? phoneNetworkField(card.type) : '';
  const amount = kind === 'airtime' ? '<div class="field"><label for="amount">Amount</label><input id="amount" type="number" min="50" step="50" value="100" required /></div>' : '';
  const smartcard = kind === 'tv' ? '<div class="field"><label for="smart-card">Smartcard number</label><input id="smart-card" inputmode="numeric" required /><div id="customer-check" class="field-help"></div></div>' : '';
  const meter = kind === 'electricity' ? '<div class="field"><label for="meter-number">Meter number</label><input id="meter-number" inputmode="numeric" required /><div id="customer-check" class="field-help"></div></div>' : '';
  const electricityAmount = kind === 'electricity' ? '<div class="field"><label for="electricity-amount">Amount</label><input id="electricity-amount" type="number" min="500" max="100000" step="1" value="500" required /></div>' : '';
  const quantity = ['education', 'data_card', 'recharge_card'].includes(kind) ? '<div class="field"><label for="quantity">Quantity</label><select id="quantity"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>10</option></select></div>' : '';
  const email = !state.user ? '<div class="field"><label for="email">Receipt email</label><input id="email" type="email" required /></div>' : '';
  openModal({ kicker: 'CHECKOUT', title: card.title, intro: kind === 'electricity' ? 'Verify the meter customer before paying.' : state.user ? 'Pay from your live wallet.' : 'Pay with Flutterwave and receive a receipt reference.', body: `<form class="modal-form" id="purchase-form" data-kind="${kind}" data-type="${card.type}">${networkField}${productField}${phone}${amount}${smartcard}${meter}${electricityAmount}${quantity}${email}<div class="modal-actions"><button class="button button-dark" type="submit">${state.user ? 'Pay from wallet' : 'Continue to payment'} <span>↗</span></button></div></form>` });
}
function walletFundingRef() { if (!state.user?.id) throw new Error('Log in to fund your wallet.'); return `FUND_${state.user.id}_${randomPart()}`; }
function launchFlutterwave({ amount, txRef, email, onSuccess }) {
  if (!window.FlutterwaveCheckout || !runtimeConfig.flutterwavePublicKey) return showToast('Flutterwave checkout is not configured.');
  window.FlutterwaveCheckout({ public_key: runtimeConfig.flutterwavePublicKey, tx_ref: txRef, amount, currency: 'NGN', payment_options: 'card,banktransfer,ussd', customer: { email }, customizations: { title: 'pudata', description: 'Payment' }, callback: onSuccess, onclose: () => showToast('Checkout closed. You can retry with the same reference.') });
}
function showFundWallet() {
  if (!state.user) return showAuth();
  const presetOptions = FUNDING_PRESETS.map((amount) => `<option value="${amount}">₦${amount.toLocaleString('en-NG')}</option>`).join('');
  openModal({ kicker: 'WALLET', title: 'Add Funds', intro: 'A flat ₦20 funding charge is added to your Flutterwave payment. Your wallet receives only the amount you choose.', body: `<form class="modal-form" id="fund-form"><div class="field"><label for="fund-preset">Amount</label><select id="fund-preset"><option value="">Choose a preset</option>${presetOptions}<option value="custom">Custom amount</option></select></div><div class="field"><label for="fund-custom">Custom amount</label><input id="fund-custom" type="number" min="200" step="1" inputmode="decimal" /></div><div class="funding-summary" id="funding-summary"><span>Amount ₦0.00</span><span>Fee ₦20.00</span><strong>Total ₦20.00</strong></div><div class="modal-actions"><button class="button button-dark" type="submit">Continue to payment <span>↗</span></button></div><p class="modal-quiet">Flutterwave verifies the total, currency, status, and FUND reference before the server credits the wallet amount.</p></form>` });
  updateFundingSummary();
}
function fundingAmount() { const preset = $('#fund-preset')?.value; const custom = Number($('#fund-custom')?.value || 0); return preset === 'custom' ? custom : Number(preset || custom || 0); }
function updateFundingSummary() { const amount = fundingAmount(); const summary = $('#funding-summary'); if (summary) summary.innerHTML = `<span>Amount ${money(amount)}</span><span>Fee ${money(FUNDING_FEE)}</span><strong>Total ${money(amount + FUNDING_FEE)}</strong>`; }

async function verifyCustomer(form, product, kind) {
  if (form.dataset.customerVerified === 'true') return true;
  const idNumber = kind === 'electricity' ? $('#meter-number', form).value.trim() : $('#smart-card', form).value.trim();
  const verificationAmount = kind === 'electricity' ? Number($('#electricity-amount', form).value) : Number(product.selling_price);
  const result = await invokeFunction('verify-customer', { service_id: product.service_id, category_id: product.category_id, id_number: idNumber, product_id: product.id, amount: verificationAmount });
  if (!result.verified) throw new Error(`${kind === 'electricity' ? 'Meter' : 'Cable'} customer verification failed.`);
  form.dataset.customerVerified = 'true';
  $('#customer-check', form).textContent = result.customer_name ? `Verified for ${result.customer_name}` : `${kind === 'electricity' ? 'Meter' : 'Cable'} customer verified.`;
  return true;
}
function purchaseParameters(form, kind) {
  if (kind === 'airtime') return { phone_number: $('#phone', form).value.trim(), amount: Number($('#amount', form).value) };
  if (kind === 'data') return { phone_number: $('#phone', form).value.trim() };
  if (kind === 'tv') return { smart_card_number: $('#smart-card', form).value.trim() };
  if (kind === 'electricity') return { meter_number: $('#meter-number', form).value.trim(), amount: Number($('#electricity-amount', form).value) };
  return { quantity: Number($('#quantity', form).value) };
}
function serviceDisplayName(kind) { const value = String(kind || '—'); return ({ airtime: 'Airtime', data: 'Data', tv: 'Cable', electricity: 'Electricity', education: 'Education pins', data_card: 'Data card pins', recharge_card: 'Recharge card pins' })[value.toLowerCase()] || value; }
function receiptContextFromForm(form, kind, product) {
  return { service: serviceDisplayName(kind), network: $('#network', form)?.value || productNetwork(product, kind), number: ['airtime', 'data'].includes(kind) ? $('#phone', form).value.trim() : kind === 'tv' ? $('#smart-card', form).value.trim() : kind === 'electricity' ? $('#meter-number', form).value.trim() : '' };
}
function saveGuestReceiptContext(reference, context) {
  try { const saved = JSON.parse(localStorage.getItem('pudata_guest_receipts') || '{}'); saved[reference] = context; localStorage.setItem('pudata_guest_receipts', JSON.stringify(saved)); } catch { /* Storage is optional. */ }
}
function savedGuestReceiptContext(reference) {
  try { return JSON.parse(localStorage.getItem('pudata_guest_receipts') || '{}')[reference] || {}; } catch { return {}; }
}
async function completeGuestPurchase(pending) {
  const result = await invokeFunction('create-purchase', { product_id: pending.product_id, email: pending.email, payment_tx_ref: pending.tx_ref, parameters: pending.parameters });
  localStorage.removeItem('pudata_pending_guest_purchase');
  showReceipt({ ...result, reference: result.reference || pending.tx_ref, guestEmail: pending.email }, pending.amount, pending.context || {});
}
function retryPendingGuestPurchase() {
  const raw = localStorage.getItem('pudata_pending_guest_purchase');
  if (!raw || state.user) return;
  try { const pending = JSON.parse(raw); openModal({ kicker: 'PAYMENT RETRY', title: 'Finish your guest payment', intro: 'Retry with the same transaction reference.', body: `<div class="receipt"><div class="receipt-row"><span>Reference</span><strong>${escapeHtml(pending.tx_ref)}</strong></div><div class="receipt-row"><span>Amount</span><strong>${money(pending.amount)}</strong></div></div><div class="modal-actions"><button class="button button-dark" type="button" data-action="retry-guest">Retry checkout <span>↗</span></button></div>` }); } catch { localStorage.removeItem('pudata_pending_guest_purchase'); }
}

async function saveProfile(form) {
  if (!supabaseClient || !state.user) throw new Error('Log in to edit your profile.');
  const fullName = $('#profile-name', form).value.trim();
  const phone = $('#profile-phone', form).value.trim();
  const file = $('#avatar-file', form).files[0];
  if (file && (file.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) throw new Error('Use a JPG, PNG, or WEBP image up to 2MB.');
  let avatarUrl = state.profile?.avatar_url || null;
  if (file) {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${state.user.id}/avatar.${ext}`;
    const upload = await supabaseClient.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
    if (upload.error) throw upload.error;
    avatarUrl = supabaseClient.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  }
  const { error } = await supabaseClient.from('profiles').update({ full_name: fullName, phone, avatar_url: avatarUrl }).eq('id', state.user.id);
  if (error) throw error;
  await loadUserData(); render(); showToast('Profile updated.');
}
async function removeAvatar() {
  if (!supabaseClient || !state.user) return;
  await supabaseClient.storage.from('avatars').remove(['jpg', 'png', 'webp'].map((ext) => `${state.user.id}/avatar.${ext}`));
  const { error } = await supabaseClient.from('profiles').update({ avatar_url: null }).eq('id', state.user.id);
  if (error) throw error;
  await loadUserData(); render(); showToast('Profile picture removed.');
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
async function fetchAllProductCosts() {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const result = await supabaseClient.from('product_costs').select('product_id,pulseflow_cost').range(start, start + 999);
    if (result.error) return { data: rows, error: result.error };
    rows.push(...(result.data || []));
    if (!result.data || result.data.length < 1000) return { data: rows, error: null };
  }
}
async function loadAdminData() {
  if (!supabaseClient || !state.isAdmin) return;
  state.admin.loading = true; state.admin.error = ''; render();
  const [users, transactions, statsTransactions, pricing, announcements, support, userCount, adminProducts, productCosts] = await Promise.all([
    supabaseClient.from('profiles').select('id,email,full_name,phone,role,suspended,created_at').order('created_at', { ascending: false }).limit(100),
    supabaseClient.from('transactions').select('id,client_reference,user_id,guest_email,service_type,status,amount,margin_amount,pulseflow_ref,created_at,failure_reason').order('created_at', { ascending: false }).limit(200),
    fetchAllRows('transactions', 'amount,margin_amount,status'),
    supabaseClient.from('pricing_rules').select('id,scope,service_id,category_id,product_id,margin_type,margin_value,active').order('created_at', { ascending: false }),
    supabaseClient.from('announcements').select('id,title,body,active,published_at').order('published_at', { ascending: false }).limit(50),
    supabaseClient.from('support_settings').select('whatsapp_url,support_email,updated_at').eq('id', true).maybeSingle(),
    supabaseClient.from('profiles').select('id', { count: 'exact', head: true }),
    supabaseClient.from('catalogue_products').select('id,service_id,category_id,name,description,product_type,selling_price,active,metadata').order('name'),
    fetchAllProductCosts()
  ]);
  state.admin.users = users.data || []; state.admin.transactions = transactions.data || []; state.admin.statsTransactions = statsTransactions.data || [];
  state.admin.pricing = pricing.data || []; state.admin.announcements = announcements.data || []; state.admin.support = support.data || null;
  state.admin.userCount = userCount.count || 0; state.admin.products = adminProducts.data || [];
  state.admin.costs = Object.fromEntries((productCosts.data || []).map((row) => [String(row.product_id), row.pulseflow_cost === null || row.pulseflow_cost === undefined ? null : Number(row.pulseflow_cost)]));
  const missingCosts = state.admin.products.filter((product) => !Object.prototype.hasOwnProperty.call(state.admin.costs, String(product.id))).length;
  const productCostError = productCosts.error?.message ? `product_costs query failed: ${productCosts.error.message}` : !(productCosts.data || []).length ? 'product_costs query returned no rows.' : missingCosts ? `product_costs has no matching cost for ${missingCosts} catalogue product(s).` : '';
  state.admin.error = users.error?.message || transactions.error?.message || statsTransactions.error?.message || pricing.error?.message || announcements.error?.message || support.error?.message || userCount.error?.message || adminProducts.error?.message || productCostError;
  state.admin.loading = false; render();
}
function adminCost(product) {
  const value = state.admin.costs[String(product.id)];
  return Number.isFinite(value) ? value : null;
}
function adminProductLabel(product) { return `${product.name} · ${productNetwork(product, product.product_type)}`; }
function renderAdminProducts() {
  const pageSize = 10;
  const filtered = state.admin.products.filter((product) => (!state.admin.productService || product.product_type === state.admin.productService || productNetwork(product, product.product_type) === state.admin.productService) && (!state.admin.productSearch || adminProductLabel(product).toLowerCase().includes(state.admin.productSearch.toLowerCase())));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  state.admin.productPage = Math.min(state.admin.productPage, pageCount);
  const visible = filtered.slice((state.admin.productPage - 1) * pageSize, state.admin.productPage * pageSize);
  const rows = visible.map((product) => { const cost = adminCost(product); const profit = cost === null ? null : Number(product.selling_price) - cost; return `<tr><td><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(productNetwork(product, product.product_type))} · ${escapeHtml(product.product_type)}</span></td><td>${cost === null ? '<span class="cost-unavailable">Unavailable</span>' : money(cost)}</td><td><div class="inline-price"><input class="admin-price-input" type="number" min="0" step="0.01" value="${Number(product.selling_price).toFixed(2)}" data-price-id="${escapeHtml(product.id)}" /><button class="text-button" data-admin-action="save-price" data-id="${escapeHtml(product.id)}">Save</button></div></td><td class="${profit !== null && profit <= 0 ? 'profit-negative' : ''}">${profit === null ? '<span class="cost-unavailable">Unavailable</span>' : money(profit)}</td><td><button class="toggle ${product.active ? 'on' : ''}" type="button" data-admin-action="toggle-product" data-id="${escapeHtml(product.id)}" aria-label="Toggle ${escapeHtml(product.name)}">${product.active ? 'On' : 'Off'}</button></td></tr>`; }).join('');
  return `<div class="admin-toolbar price-toolbar"><input class="admin-filter" id="admin-product-search" value="${escapeHtml(state.admin.productSearch)}" aria-label="Search products" /><select class="admin-filter" id="admin-product-service" aria-label="Filter products by service or network"><option value="">All services and networks</option>${[...new Set(state.admin.products.flatMap((p) => [p.product_type, productNetwork(p, p.product_type)]))].sort().map((value) => `<option value="${escapeHtml(value)}" ${state.admin.productService === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></div><div class="admin-card"><table class="admin-table price-table"><thead><tr><th>Product name<br /><span>Service / network</span></th><th>PulseFlow cost</th><th>My selling price</th><th>My profit</th><th>Active</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No products match this filter.</td></tr>'}</tbody></table></div><div class="pagination"><button class="text-button" data-admin-action="product-page" data-page="${state.admin.productPage - 1}" ${state.admin.productPage <= 1 ? 'disabled' : ''}>← Previous</button><span>Page ${state.admin.productPage} of ${pageCount}</span><button class="text-button" data-admin-action="product-page" data-page="${state.admin.productPage + 1}" ${state.admin.productPage >= pageCount ? 'disabled' : ''}>Next →</button></div>`;
}
function renderAdmin() {
  if (!state.isAdmin) return renderDashboard();
  if (state.admin.loading) return '<section class="dashboard-head"><h1>Admin</h1><p>Loading live records…</p></section><div class="empty-state">Loading live data.</div>';
  const txs = state.admin.transactions.filter((t) => (!state.admin.statusFilter || t.status === state.admin.statusFilter) && (!state.admin.referenceFilter || `${t.client_reference} ${t.pulseflow_ref || ''}`.toLowerCase().includes(state.admin.referenceFilter.toLowerCase())));
  const allTxs = state.admin.statsTransactions; const sales = allTxs.filter((t) => t.status === 'success').reduce((sum, t) => sum + Number(t.amount || 0), 0); const profit = allTxs.filter((t) => t.status === 'success').reduce((sum, t) => sum + Number(t.margin_amount || 0), 0); const pending = allTxs.filter((t) => t.status === 'pending').length; const failed = allTxs.filter((t) => ['failed', 'reversed', 'refund_pending'].includes(t.status)).length;
  const error = state.admin.error ? `<div class="notice">${escapeHtml(state.admin.error)}</div>` : '';
  const users = state.admin.users.length ? `<div class="admin-card"><table class="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>${state.admin.users.map((u) => `<tr><td>${escapeHtml(u.full_name || '—')}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.role)}</td><td>${u.suspended ? 'Suspended' : 'Active'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><strong>No users found</strong></div>';
  const transactions = txs.length ? `<div class="admin-card"><table class="admin-table"><thead><tr><th>Reference</th><th>Service</th><th>Amount</th><th>Status</th><th>PulseFlow</th><th>Actions</th></tr></thead><tbody>${txs.map((t) => `<tr><td>${escapeHtml(t.client_reference)}</td><td>${escapeHtml(t.service_type)}</td><td>${money(t.amount)}</td><td>${escapeHtml(t.status)}</td><td>${escapeHtml(t.pulseflow_ref || '—')}</td><td><button class="text-button" data-admin-action="recheck" data-reference="${escapeHtml(t.client_reference)}">Re-check</button>${['pending', 'failed', 'reversed', 'refund_pending'].includes(t.status) ? `<button class="text-button" data-admin-action="mark-failed" data-id="${t.id}">Mark failed</button><button class="text-button" data-admin-action="refund" data-reference="${escapeHtml(t.client_reference)}">Refund</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><strong>No transactions found</strong></div>';
  const pricing = state.admin.pricing.length ? `<div class="admin-card"><table class="admin-table"><thead><tr><th>Scope</th><th>Target</th><th>Margin</th><th>Status</th></tr></thead><tbody>${state.admin.pricing.map((r) => `<tr><td>${escapeHtml(r.scope)}</td><td>${escapeHtml(r.product_id || r.category_id || r.service_id || '—')}</td><td>${escapeHtml(r.margin_type)} ${escapeHtml(r.margin_value)}</td><td>${r.active ? 'Active' : 'Inactive'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><strong>No pricing rules found</strong></div>';
  const attention = state.admin.transactions.filter((t) => ['pending', 'failed', 'reversed', 'refund_pending'].includes(t.status));
  const announcements = state.admin.announcements.length ? `<div class="admin-list">${state.admin.announcements.map((a) => `<div class="notice"><strong>${escapeHtml(a.title)}</strong><br />${escapeHtml(a.body)}</div>`).join('')}</div>` : '<div class="empty-state"><strong>No announcements found</strong></div>';
  const support = state.admin.support || {};
  return `<section class="dashboard-head admin-head"><div><div class="date-line">Operations</div><h1>Admin</h1><p>Live records and controls for pudata.</p></div><button class="button button-outline" data-action="logout">Log out</button></section>${error}<section class="section"><div class="admin-grid"><div class="metric"><span>Total users</span><strong>${state.admin.userCount}</strong></div><div class="metric"><span>Total sales</span><strong>${money(sales)}</strong></div><div class="metric"><span>Total profit</span><strong>${money(profit)}</strong></div><div class="metric"><span>Pending / failed</span><strong>${pending} / ${failed}</strong></div></div></section><section class="section"><div class="section-heading"><div><h2>Price management</h2><p>Customers see selling price only. Cost data is admin-only.</p></div></div><div class="price-management"><button class="button button-dark" data-admin-action="sync-prices">SYNC PULSEFLOW PRICES</button>${state.admin.syncMessage ? `<div class="notice">${escapeHtml(state.admin.syncMessage)}</div>` : ''}<div class="admin-toolbar margin-toolbar"><select class="admin-filter" id="margin-type" aria-label="Margin type"><option value="percentage" ${state.admin.marginType === 'percentage' ? 'selected' : ''}>Percentage margin</option><option value="fixed" ${state.admin.marginType === 'fixed' ? 'selected' : ''}>Fixed naira margin</option></select><input class="admin-filter" id="margin-value" type="number" min="0" step="0.01" value="${escapeHtml(state.admin.marginValue)}" aria-label="Margin value" /><button class="button button-outline" data-admin-action="apply-margin">Apply margin to filtered products</button></div>${renderAdminProducts()}</div></section><section class="section"><div class="section-heading"><div><h2>Users</h2><p>Live profile records.</p></div></div>${users}</section><section class="section"><div class="section-heading"><div><h2>Transactions</h2><p>Latest live transaction records.</p></div></div><div class="admin-toolbar"><select class="admin-filter" id="admin-status-filter" aria-label="Filter transactions by status"><option value="">All statuses</option><option value="pending" ${state.admin.statusFilter === 'pending' ? 'selected' : ''}>Pending</option><option value="success" ${state.admin.statusFilter === 'success' ? 'selected' : ''}>Success</option><option value="failed" ${state.admin.statusFilter === 'failed' ? 'selected' : ''}>Failed</option></select><input class="admin-filter" id="admin-reference-filter" value="${escapeHtml(state.admin.referenceFilter)}" aria-label="Filter by reference or PulseFlow reference" /></div>${transactions}</section><section class="section"><div class="section-heading"><div><h2>Pending / Failed</h2><p>Transactions needing an operational decision.</p></div></div>${attention.length ? `<div class="transaction-list">${attention.map((t) => `<div class="transaction-row"><div><strong>${escapeHtml(t.client_reference)}</strong><span>${escapeHtml(t.service_type)} · ${escapeHtml(t.status)}</span></div><div><button class="text-button" data-admin-action="recheck" data-reference="${escapeHtml(t.client_reference)}">Re-check</button><button class="text-button" data-admin-action="refund" data-reference="${escapeHtml(t.client_reference)}">Refund</button></div></div>`).join('')}</div>` : '<div class="empty-state"><strong>No pending or failed transactions</strong></div>'}</section><section class="section"><div class="section-heading"><div><h2>Pricing rules</h2><p>Margins from live pricing rules.</p></div></div>${pricing}<div class="admin-toolbar"><button class="button button-dark" data-admin-action="refresh-catalogue">Refresh catalogue</button></div></section><section class="section"><div class="section-heading"><div><h2>Announcements</h2><p>Published notices from Supabase.</p></div></div>${announcements}</section><section class="section"><div class="section-heading"><div><h2>Support settings</h2><p>Customer support contact.</p></div></div><div class="notice">${escapeHtml(support.support_email || supportEmail)}${support.whatsapp_url ? ` · <a href="${escapeHtml(support.whatsapp_url)}" target="_blank" rel="noreferrer">WhatsApp</a>` : ''}</div></section>`;
}

async function handleAdminAction(target) {
  const action = target.dataset.adminAction;
  try {
    if (action === 'recheck') await invokeFunction('recheck-transaction', { reference: target.dataset.reference });
    if (action === 'refund') await invokeFunction('admin-refund', { reference: target.dataset.reference, reason: 'Admin-approved refund' });
    if (action === 'mark-failed') { const { error } = await supabaseClient.from('transactions').update({ status: 'failed', failure_reason: 'Marked failed by admin' }).eq('id', target.dataset.id); if (error) throw error; }
    if (action === 'refresh-catalogue' || action === 'sync-prices') {
      const result = await invokeFunction('refresh-catalogue', {});
      state.admin.syncMessage = `Catalogue sync complete. Services: ${result.services || 0}; categories: ${result.categories || 0}; products: ${result.products || 0}.${result.error ? ` Error: ${result.error}` : ' Selling prices were preserved.'}`;
      await loadCatalogue();
    }
    if (action === 'save-price') {
      const input = $(`[data-price-id="${CSS.escape(target.dataset.id)}"]`);
      const price = Number(input?.value);
      if (!Number.isFinite(price) || price < 0) throw new Error('Enter a valid selling price.');
      const { error } = await supabaseClient.from('catalogue_products').update({ selling_price: price }).eq('id', target.dataset.id); if (error) throw error;
    }
    if (action === 'toggle-product') {
      const product = state.admin.products.find((item) => item.id === target.dataset.id); if (!product) throw new Error('Product not found.');
      const { error } = await supabaseClient.from('catalogue_products').update({ active: !product.active }).eq('id', product.id); if (error) throw error;
    }
    if (action === 'product-page') { state.admin.productPage = Math.max(1, Number(target.dataset.page)); render(); return; }
    if (action === 'apply-margin') {
      const amount = Number($('#margin-value')?.value); const type = $('#margin-type')?.value;
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a valid margin.');
      state.admin.marginType = type; state.admin.marginValue = String(amount);
      const products = state.admin.products.filter((product) => (!state.admin.productService || product.product_type === state.admin.productService || productNetwork(product, product.product_type) === state.admin.productService) && (!state.admin.productSearch || adminProductLabel(product).toLowerCase().includes(state.admin.productSearch.toLowerCase())));
      for (const product of products) { const cost = adminCost(product); if (cost === null) throw new Error(`No product_costs row matches ${product.name}.`); const price = type === 'percentage' ? cost * (1 + amount / 100) : cost + amount; const { error } = await supabaseClient.from('catalogue_products').update({ selling_price: Math.round(price * 100) / 100 }).eq('id', product.id); if (error) throw error; }
    }
    await loadAdminData();
  } catch (error) { showToast(error.message || 'The admin action failed.'); }
}

function navigate(path) { closeDrawer(); closeModal(); window.history.pushState({}, '', path); state.route = path; render(); if (path === '/admin') loadAdminData(); }
async function handleSubmit(form) {
  if (form.id === 'auth-form') {
    const email = $('#auth-email').value.trim(); const password = $('#auth-password').value; const signup = form.dataset.mode === 'signup';
    const result = signup ? await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: $('#auth-name').value.trim() } } }) : await supabaseClient.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error; await syncSession(); closeModal(); showToast(signup ? 'Account created. Check your email if confirmation is enabled.' : 'You are signed in.'); return;
  }
  if (form.id === 'profile-form') { await saveProfile(form); return; }
  if (form.id === 'guest-receipt-form') {
    const reference = $('#receipt-reference', form).value.trim(); const email = $('#receipt-email', form).value.trim();
    const result = await fetchGuestReceipt(reference, email);
    showReceipt({ ...result, reference, guestEmail: email }, result.amount, savedGuestReceiptContext(reference));
    return;
  }
  if (form.id === 'fund-form') {
    const amount = fundingAmount(); if (!Number.isFinite(amount) || amount < 200) throw new Error('Minimum wallet funding amount is ₦200.');
    const total = amount + FUNDING_FEE; const txRef = walletFundingRef(); closeModal();
    launchFlutterwave({ amount: total, txRef, email: state.user.email, onSuccess: async (response) => { if (!['successful', 'completed'].includes(response?.status)) return showToast('Flutterwave did not confirm this payment.'); try { const result = await invokeFunction('flutterwave-verify', { tx_ref: txRef, expected_amount: total, credit_amount: amount, purpose: 'wallet_funding' }); if (!result.verified || !result.credited) throw new Error('Payment was not verified. The wallet was not changed.'); await loadUserData(); render(); showToast('Wallet balance refreshed.'); } catch (error) { showToast(error.message); } } }); return;
  }
  if (form.id === 'purchase-form') {
    const kind = form.dataset.kind; const type = form.dataset.type; const product = state.products.find((item) => item.id === $('#product', form).value); if (!product) throw new Error('Choose an available catalogue product.');
    if (kind === 'tv' || kind === 'electricity') await verifyCustomer(form, product, kind);
    const parameters = purchaseParameters(form, kind); const amount = ['airtime', 'electricity'].includes(kind) ? parameters.amount : Number(product.selling_price);
    if (kind === 'airtime' && amount < 50) throw new Error('Airtime amount must be at least ₦50.');
    if (kind === 'electricity' && (parameters.amount < 500 || parameters.amount > 100000)) throw new Error('Electricity amount must be between ₦500 and ₦100,000.');
    const context = receiptContextFromForm(form, kind, product);
    if (state.user) { const result = await invokeFunction('create-purchase', { product_id: product.id, parameters }); await loadUserData(); render(); closeModal(); showReceipt(result, amount, context); return; }
    const email = $('#email', form).value.trim(); const pending = { product_id: product.id, kind, type, amount, email, parameters, context, tx_ref: `PUD_${new Date().getFullYear()}_${randomPart()}` }; saveGuestReceiptContext(pending.tx_ref, context); localStorage.setItem('pudata_pending_guest_purchase', JSON.stringify(pending)); closeModal();
    launchFlutterwave({ amount, txRef: pending.tx_ref, email, onSuccess: async (response) => { if (!['successful', 'completed'].includes(response?.status)) return showToast('Flutterwave did not confirm this payment.'); try { await completeGuestPurchase(pending); } catch { showToast(`Fulfilment needs a retry with ${pending.tx_ref}.`); } } });
  }
}
function handleAction(action, target) {
  if (action === 'profile') { if (state.user) navigate('/profile'); else showAuth(); }
  if (action === 'login') showAuth('login'); if (action === 'signup') showAuth('signup');
  if (action === 'logout') { supabaseClient?.auth.signOut(); state.user = null; state.profile = null; state.wallet = null; state.transactions = []; state.isAdmin = false; closeModal(); navigate('/'); showToast('You are signed out.'); }
  if (action === 'fund-wallet') showFundWallet(); if (action === 'history') showHistory(); if (action === 'help') showHelp(); if (action === 'more') openDrawer(); if (action === 'close-menu') closeDrawer(); if (action === 'close-modal') closeModal();
  if (action === 'toggle-services') { state.showAllServices = !state.showAllServices; render(); }
  if (action === 'service') { if (['airtime', 'data'].includes(target.dataset.service)) navigate(`/${target.dataset.service}`); else showPurchase(target.dataset.service); }
  if (action === 'airtime-amount') { const input = $('#amount'); if (input) { input.value = target.dataset.amount; $$('.amount-tile').forEach((tile) => tile.classList.toggle('selected', tile === target)); } }
  if (action === 'data-validity') { state.dataValidity = target.dataset.validity; $$('.validity-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.validity === state.dataValidity)); renderDataPlans($('#purchase-form')); }
  if (action === 'data-plan') showDataConfirm(target.dataset.id);
  if (action === 'confirm-data-plan') { const form = $('#purchase-form'); const product = state.products.find((item) => item.id === state.dataConfirmProductId); if (!form || !product) return showToast('Choose a data plan first.'); const select = $('#product', form); select.value = product.id; closeModal(); form.requestSubmit(); }
  if (action === 'refresh-wallet') loadUserData().then(render);
  if (action === 'guest-receipt-lookup') showGuestReceiptLookup();
  if (action === 'remove-avatar') removeAvatar().catch((error) => showToast(error.message));
  if (action === 'retry-guest') { const pending = JSON.parse(localStorage.getItem('pudata_pending_guest_purchase') || 'null'); if (pending) { closeModal(); launchFlutterwave({ amount: pending.amount, txRef: pending.tx_ref, email: pending.email, onSuccess: async (response) => { if (['successful', 'completed'].includes(response?.status)) { try { await completeGuestPurchase(pending); } catch { showToast(`Fulfilment needs a retry with ${pending.tx_ref}.`); } } } }); } }
}

document.addEventListener('click', (event) => { const copyTarget = event.target.closest('[data-copy-token]'); if (copyTarget) { const copyPromise = navigator.clipboard ? navigator.clipboard.writeText(copyTarget.dataset.copyToken) : Promise.reject(new Error('Clipboard unavailable')); copyPromise.then(() => showToast('Token copied.')).catch(() => showToast('Copy failed.')); return; } const routeTarget = event.target.closest('[data-route]'); if (routeTarget) { event.preventDefault(); navigate(routeTarget.dataset.route); return; } const adminTarget = event.target.closest('[data-admin-action]'); if (adminTarget) { event.preventDefault(); handleAdminAction(adminTarget); return; } const actionTarget = event.target.closest('[data-action]'); if (actionTarget) handleAction(actionTarget.dataset.action, actionTarget); });
document.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const isPaymentForm = form.id === 'purchase-form' || form.id === 'fund-form';
  if (isPaymentForm && form.dataset.submitting === 'true') return;
  const submitButton = isPaymentForm ? form.querySelector('button[type="submit"]') : null;
  const originalButtonHtml = submitButton?.innerHTML;
  if (isPaymentForm) { form.dataset.submitting = 'true'; if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Processing…'; } }
  handleSubmit(form).catch((error) => {
    if (isPaymentForm) { delete form.dataset.submitting; if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = originalButtonHtml; } }
    showToast(error.message || 'Something went wrong.');
  });
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'fund-preset' || event.target.id === 'fund-custom') updateFundingSummary();
  if (event.target.dataset.role === 'network') { const form = event.target.closest('#purchase-form'); updateNetworkSelection(form, event.target.value); if (form?.dataset.kind === 'data') renderDataPlans(form); form.dataset.customerVerified = 'false'; }
  if (event.target.id === 'admin-status-filter') { state.admin.statusFilter = event.target.value; render(); }
  if (event.target.id === 'admin-product-service') { state.admin.productService = event.target.value; state.admin.productPage = 1; render(); }
  if (event.target.id === 'margin-type') state.admin.marginType = event.target.value;
  if (event.target.id === 'margin-value') state.admin.marginValue = event.target.value;
});
document.addEventListener('input', (event) => {
  if (event.target.dataset.phoneInput) {
    const form = event.target.closest('#purchase-form');
    const detected = detectNetwork(event.target.value);
    if (form && detected) updateNetworkSelection(form, detected);
    if (form?.dataset.kind === 'data') renderDataPlans(form);
    const help = form && $('#network-help', form);
    if (help && detected) help.textContent = `Detected ${detected}. Tap the logo to change it if your number was ported.`;
  }
  if (['meter-number', 'smart-card', 'electricity-amount'].includes(event.target.id)) {
    const form = event.target.closest('#purchase-form');
    if (form) { form.dataset.customerVerified = 'false'; if ($('#customer-check', form)) $('#customer-check', form).textContent = ''; }
  }
  if (event.target.id === 'admin-reference-filter') { state.admin.referenceFilter = event.target.value; render(); const input = $('#admin-reference-filter'); if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } }
  if (event.target.id === 'admin-product-search') { state.admin.productSearch = event.target.value; state.admin.productPage = 1; render(); const input = $('#admin-product-search'); if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } }
});
window.addEventListener('popstate', () => { state.route = window.location.pathname; render(); if (state.route === '/admin') loadAdminData(); });
syncSession();
