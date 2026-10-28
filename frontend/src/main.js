import { createClient } from '@supabase/supabase-js';

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE = (configuredApiBase || (import.meta.env.DEV
  ? `http://${window.location.hostname}:8000`
  : '')).replace(/\/$/, '');
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const localDemoMode = import.meta.env.VITE_LOCAL_DEMO === 'true';
const supabase = !localDemoMode && supabaseUrl && supabasePublishableKey ? createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null;

const appState = {
  token: localStorage.getItem('smartstock_token') || '',
  user: JSON.parse(localStorage.getItem('smartstock_user') || 'null'),
  products: [],
  sales: [],
  draftItems: [],
  homeCart: [],
  saleSubmitting: false,
  productImagePreviewUrl: '',
};

const els = {
  loginScreen: document.querySelector('#login-screen'),
  mainShell: document.querySelector('#main-shell'),
  loginForm: document.querySelector('#login-form'),
  loggedUser: document.querySelector('#logged-user'),
  topbarTitle: document.querySelector('#topbar-title'),
  configBanner: document.querySelector('#config-banner'),
  navigation: document.querySelectorAll('.nav-item'),
  views: document.querySelectorAll('.view'),
  statProducts: document.querySelector('#stat-products'),
  statSalesDay: document.querySelector('#stat-sales-day'),
  statLowStock: document.querySelector('#stat-low-stock'),
  statTotalSales: document.querySelector('#stat-total-sales'),
  homeProductSearch: document.querySelector('#home-product-search'),
  homeCategoryFilter: document.querySelector('#home-category-filter'),
  homeProductGrid: document.querySelector('#home-product-grid'),
  homeCartCount: document.querySelector('#home-cart-count'),
  homeCartItems: document.querySelector('#home-cart-items'),
  homeCartTotal: document.querySelector('#home-cart-total'),
  productTableBody: document.querySelector('#product-table-body'),
  productSearch: document.querySelector('#product-search'),
  productCategoryFilter: document.querySelector('#product-category-filter'),
  inventoryTableBody: document.querySelector('#inventory-table-body'),
  productForm: document.querySelector('#product-form'),
  productId: document.querySelector('#product-id'),
  productName: document.querySelector('#product-name'),
  productDescription: document.querySelector('#product-description'),
  productCategory: document.querySelector('#product-category'),
  productPrice: document.querySelector('#product-price'),
  productQuantity: document.querySelector('#product-quantity'),
  productMinStock: document.querySelector('#product-min-stock'),
  productImageUrl: document.querySelector('#product-image-url'),
  productImageFile: document.querySelector('#product-image-file'),
  productImagePreviewWrap: document.querySelector('#product-image-preview-wrap'),
  productImagePreview: document.querySelector('#product-image-preview'),
  removeProductImageBtn: document.querySelector('#remove-product-image-btn'),
  productDetailDialog: document.querySelector('#product-detail-dialog'),
  productDetailContent: document.querySelector('#product-detail-content'),
  closeProductDetailBtn: document.querySelector('#close-product-detail-btn'),
  saleForm: document.querySelector('#sale-form'),
  saleProduct: document.querySelector('#sale-product'),
  saleQuantity: document.querySelector('#sale-quantity'),
  saleItemsBody: document.querySelector('#sale-items-body'),
  saleTotal: document.querySelector('#sale-total'),
  saleNotes: document.querySelector('#sale-notes'),
  salesHistoryBody: document.querySelector('#sales-history-body'),
  salesDateFilter: document.querySelector('#sales-date-filter'),
  assistantForm: document.querySelector('#assistant-form'),
  assistantInput: document.querySelector('#assistant-input'),
  assistantMessages: document.querySelector('#assistant-messages'),
  logoutBtn: document.querySelector('#logout-btn'),
  newProductBtn: document.querySelector('#new-product-btn'),
  cancelProductBtn: document.querySelector('#cancel-product-btn'),
  addSaleItemBtn: document.querySelector('#add-sale-item-btn'),
  confirmSaleBtn: document.querySelector('#confirm-sale-btn'),
  clearHomeCartBtn: document.querySelector('#clear-home-cart-btn'),
  continueToSalesBtn: document.querySelector('#continue-to-sales-btn'),
};

function formatMoney(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
  }).format(Number(value || 0));
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function getProduct(productId) {
  return appState.products.find((product) => String(product.id) === String(productId));
}

function imageMarkup(product, className = 'product-thumb') {
  const imageUrl = String(product.image_url || '').trim();
  if (!imageUrl) {
    return `<div class="${className} image-placeholder" aria-label="Producto sin imagen">Sin imagen</div>`;
  }
  return `<img class="${className} product-image" src="${escapeHTML(imageUrl)}" alt="${escapeHTML(product.name || 'Imagen del producto')}" loading="lazy" />`;
}

function attachImageFallbacks(container) {
  container.querySelectorAll('img.product-image').forEach((image) => {
    image.addEventListener('error', () => {
      const placeholder = document.createElement('div');
      placeholder.className = `${image.className.replace('product-image', '').trim()} image-placeholder`.trim();
      placeholder.textContent = 'Imagen no disponible';
      placeholder.setAttribute('aria-label', 'Imagen no disponible');
      image.replaceWith(placeholder);
    }, { once: true });
  });
}

function renderProductCategories() {
  const categories = [...new Set(appState.products.map((product) => product.category).filter(Boolean))].sort();
  for (const select of [els.productCategoryFilter, els.homeCategoryFilter]) {
    const currentValue = select.value;
    select.innerHTML = '<option value="">Todas las categorías</option>' +
      categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
    select.value = categories.includes(currentValue) ? currentValue : '';
  }
}

function setView(viewName) {
  els.views.forEach((view) => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  els.navigation.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  els.topbarTitle.textContent = {
    dashboard: 'Dashboard',
    products: 'Productos',
    inventory: 'Inventario',
    sales: 'Ventas',
    history: 'Historial',
    assistant: 'Asistente IA',
  }[viewName] || 'Dashboard';
  if (viewName === 'sales') renderDraftItems();
}

function updateAuthUI() {
  const user = appState.user;
  const isAdmin = user?.role === 'admin';
  if (user) {
    els.loggedUser.textContent = `${user.name} (${user.role})`;
  }

  document.querySelectorAll('.admin-only').forEach((el) => {
    el.disabled = !isAdmin;
    el.style.opacity = isAdmin ? '1' : '0.5';
  });
}

function saveSession(token, user) {
  appState.token = token;
  appState.user = user;
  if (supabase) {
    localStorage.removeItem('smartstock_token');
  } else {
    localStorage.setItem('smartstock_token', token);
  }
  localStorage.setItem('smartstock_user', JSON.stringify(user));
}

async function clearSession() {
  appState.token = '';
  appState.user = null;
  localStorage.removeItem('smartstock_token');
  localStorage.removeItem('smartstock_user');
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      throw error;
    }
  }
}

async function getActiveToken() {
  if (!supabase) {
    return appState.token;
  }

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return session?.access_token || '';
}

async function apiFetch(url, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(options.headers || {}),
  };

  if (!isFormData) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  if (supabase) {
    const token = await getActiveToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } else if (appState.token) {
    headers.Authorization = `Bearer ${appState.token}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(data?.detail || data?.message || 'Error en la solicitud');
  }

  return data;
}

async function bootstrap() {
  try {
    const systemStatus = await apiFetch('/api/system');
    if (!systemStatus.supabase_configured) {
      els.configBanner.textContent = systemStatus.message;
      els.configBanner.classList.remove('hidden');
    }
  } catch (error) {
    els.configBanner.textContent = 'No se pudo verificar el backend. No se cambiará automáticamente a datos locales.';
    els.configBanner.classList.remove('hidden');
  }

  if (supabase) {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        throw error;
      }
      if (session?.access_token) {
        appState.token = session.access_token;
      }
    } catch (error) {
      try {
        await clearSession();
      } catch (signOutError) {
        console.error('No se pudo limpiar la sesión local de Supabase.', signOutError);
      }
    }
  }

  if (!appState.token || !appState.user) {
    showLogin();
    return;
  }

  try {
    const user = await apiFetch('/api/me');
    appState.user = user;
    saveSession(appState.token, user);
    showApp();
    await Promise.all([loadDashboard(), loadProducts(), loadSales()]);
    renderInventory();
  } catch (error) {
    try {
      await clearSession();
    } catch (signOutError) {
      console.error('No se pudo limpiar la sesión local de Supabase.', signOutError);
    }
    showLogin();
  }
}

function showLogin() {
  els.loginScreen.classList.remove('hidden');
  els.mainShell.classList.add('hidden');
}

function showApp() {
  els.loginScreen.classList.add('hidden');
  els.mainShell.classList.remove('hidden');
  updateAuthUI();
  setView('dashboard');
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.querySelector('#login-email').value.trim();
  const password = document.querySelector('#login-password').value.trim();

  try {
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(error.message);
      }
      const sessionToken = data.session?.access_token;
      if (!sessionToken) {
        throw new Error('No se pudo obtener el token de la sesión.');
      }
      const meResponse = await apiFetch('/api/me');
      saveSession(sessionToken, meResponse);
      showApp();
      await Promise.all([loadDashboard(), loadProducts(), loadSales()]);
      renderInventory();
      return;
    }

    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    saveSession(response.token, response.user);
    showApp();
    await Promise.all([loadDashboard(), loadProducts(), loadSales()]);
    renderInventory();
  } catch (error) {
    if (supabase) {
      try {
        await clearSession();
      } catch (signOutError) {
        console.error('No se pudo limpiar la sesión local de Supabase.', signOutError);
      }
    }
    alert(error.message);
  }
}

async function loadDashboard() {
  const dashboard = await apiFetch('/api/dashboard');
  els.statProducts.textContent = dashboard.products_count;
  els.statSalesDay.textContent = dashboard.sales_today;
  els.statLowStock.textContent = dashboard.low_stock_count;
  els.statTotalSales.textContent = formatMoney(dashboard.total_revenue);
}

async function loadProducts() {
  const products = await apiFetch('/api/products');
  appState.products = products;
  renderProductCategories();
  renderProductTable();
  renderHomeCatalog();
  renderHomeCart();
  renderInventory();
  populateSalesSelector();
  renderDraftItems();
  refreshOpenProductDetails();
}

function renderHomeCatalog() {
  const search = els.homeProductSearch.value.trim().toLocaleLowerCase();
  const category = els.homeCategoryFilter.value;
  const filtered = appState.products.filter((product) => {
    const matchesName = !search || String(product.name || '').toLocaleLowerCase().includes(search);
    return matchesName && (!category || product.category === category);
  });

  if (!filtered.length) {
    els.homeProductGrid.innerHTML = '<p class="empty-state">No se encontraron productos con esos filtros.</p>';
    return;
  }

  els.homeProductGrid.innerHTML = filtered.map((product) => {
    const inCart = appState.homeCart.find((item) => item.product_id === product.id)?.quantity || 0;
    return `
      <article class="catalog-product-card">
        <button type="button" class="catalog-image-button" data-open-product="${escapeHTML(product.id)}" aria-label="Ver detalles de ${escapeHTML(product.name)}">
          ${imageMarkup(product, 'catalog-product-image')}
        </button>
        <div class="catalog-product-info">
          <button type="button" class="product-name-button" data-open-product="${escapeHTML(product.id)}">${escapeHTML(product.name)}</button>
          <span class="product-category">${escapeHTML(product.category || 'Sin categoría')}</span>
          <strong>${formatMoney(product.price)}</strong>
          <span class="stock-caption">${Number(product.quantity)} disponibles</span>
          <button type="button" class="primary-btn add-home-item-btn" data-home-add="${escapeHTML(product.id)}" ${Number(product.quantity) <= 0 ? 'disabled' : ''}>
            ${inCart ? `Agregar otra unidad (${inCart} preparadas)` : 'Agregar al carrito'}
          </button>
        </div>
      </article>
    `;
  }).join('');
  attachImageFallbacks(els.homeProductGrid);
}

function renderProductTable() {
  const search = els.productSearch.value.trim().toLowerCase();
  const category = els.productCategoryFilter.value;

  const filtered = appState.products.filter((product) => {
    const matchesCategory = category ? product.category === category : true;
    const matchesSearch = !search || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });

  if (!filtered.length) {
    els.productTableBody.innerHTML = '<tr><td colspan="6">No hay productos registrados.</td></tr>';
    return;
  }

  els.productTableBody.innerHTML = filtered
    .map(
      (product) => `
        <tr>
          <td>${imageMarkup(product)}</td>
          <td>${escapeHTML(product.name)}</td>
          <td>${escapeHTML(product.category)}</td>
          <td>${Number(product.quantity)}</td>
          <td>${formatMoney(product.price)}</td>
          <td>
            <div class="table-actions">
              <button class="icon-btn" data-edit-id="${escapeHTML(product.id)}">Editar</button>
              <button class="icon-btn admin-only" data-delete-id="${escapeHTML(product.id)}">Eliminar</button>
            </div>
          </td>
        </tr>
      `
    )
    .join('');

  attachImageFallbacks(els.productTableBody);
  updateAuthUI();
}

function renderInventory() {
  const list = appState.products
    .map((product) => {
      const status = Number(product.quantity) <= Number(product.min_stock) ? 'warning' : 'ok';
      const label = Number(product.quantity) === 0 ? 'Sin stock' : Number(product.quantity) <= Number(product.min_stock) ? 'Bajo' : 'Normal';
      return `
        <tr>
          <td><button type="button" class="inventory-image-button" data-open-product="${escapeHTML(product.id)}" aria-label="Ver detalles de ${escapeHTML(product.name)}">${imageMarkup(product)}</button></td>
          <td><button type="button" class="product-name-button" data-open-product="${escapeHTML(product.id)}">${escapeHTML(product.name)}</button></td>
          <td>${escapeHTML(product.category)}</td>
          <td>${Number(product.quantity)}</td>
          <td>${Number(product.min_stock)}</td>
          <td><span class="badge ${status}">${label}</span></td>
          <td>
            <button class="icon-btn admin-only" data-stock-id="${escapeHTML(product.id)}">Actualizar</button>
          </td>
        </tr>
      `;
    })
    .join('');

  els.inventoryTableBody.innerHTML = list || '<tr><td colspan="7">No hay inventario disponible.</td></tr>';
  attachImageFallbacks(els.inventoryTableBody);
  updateAuthUI();
}

function renderHomeCart() {
  const units = appState.homeCart.reduce((sum, item) => sum + item.quantity, 0);
  els.homeCartCount.textContent = `${units} ${units === 1 ? 'unidad' : 'unidades'}`;
  const total = appState.homeCart.reduce((sum, item) => {
    const product = getProduct(item.product_id);
    return sum + (product ? Number(product.price) * item.quantity : 0);
  }, 0);
  els.homeCartTotal.textContent = formatMoney(total);

  if (!appState.homeCart.length) {
    els.homeCartItems.innerHTML = '<p class="empty-state">Agrega productos para preparar una venta. No se registrará ni descontará inventario.</p>';
    els.continueToSalesBtn.disabled = true;
    return;
  }

  els.homeCartItems.innerHTML = appState.homeCart.map((item) => {
    const product = getProduct(item.product_id);
    const name = product?.name || 'Producto no disponible';
    const price = product ? Number(product.price) : 0;
    return `
      <article class="cart-item">
        <div class="cart-item-heading">
          <button type="button" class="product-name-button" data-open-product="${escapeHTML(item.product_id)}">${escapeHTML(name)}</button>
          <button type="button" class="icon-btn remove-cart-item-btn" data-home-remove="${escapeHTML(item.product_id)}" aria-label="Quitar ${escapeHTML(name)}">Quitar</button>
        </div>
        <div class="cart-item-controls">
          <div class="quantity-controls">
            <button type="button" class="quantity-btn" data-home-decrease="${escapeHTML(item.product_id)}" aria-label="Reducir cantidad">−</button>
            <span>${item.quantity}</span>
            <button type="button" class="quantity-btn" data-home-increase="${escapeHTML(item.product_id)}" aria-label="Aumentar cantidad" ${!product || item.quantity >= Number(product.quantity) ? 'disabled' : ''}>+</button>
          </div>
          <span>${formatMoney(price * item.quantity)}</span>
        </div>
        <small>${product ? `${Number(product.quantity)} disponibles` : 'Actualiza el catálogo para validar existencias'}</small>
      </article>
    `;
  }).join('');
  els.continueToSalesBtn.disabled = false;
}

function renderProductDetails(product) {
  const coreFields = new Set([
    'id', 'name', 'description', 'category', 'price', 'quantity', 'min_stock',
    'image_url', 'created_at', 'updated_at',
  ]);
  const extraFields = Object.entries(product)
    .filter(([key, value]) => !coreFields.has(key) && value !== null && typeof value !== 'object')
    .map(([key, value]) => `<div class="detail-field"><dt>${escapeHTML(key.replaceAll('_', ' '))}</dt><dd>${escapeHTML(value)}</dd></div>`)
    .join('');
  const image = product.image_url
    ? imageMarkup(product, 'product-detail-image')
    : '<div class="product-detail-image image-placeholder">Sin imagen</div>';

  els.productDetailContent.innerHTML = `
    ${image}
    <div class="product-detail-copy">
      <p class="eyebrow">${escapeHTML(product.category || 'Producto')}</p>
      <h2 id="product-detail-title">${escapeHTML(product.name || 'Producto')}</h2>
      <p class="product-detail-description">${escapeHTML(product.description || 'Sin descripción disponible.')}</p>
      <dl class="product-detail-fields">
        <div class="detail-field"><dt>Categoría</dt><dd>${escapeHTML(product.category || 'Sin categoría')}</dd></div>
        <div class="detail-field"><dt>Precio</dt><dd>${formatMoney(product.price)}</dd></div>
        <div class="detail-field"><dt>Existencias</dt><dd>${Number(product.quantity || 0)}</dd></div>
        <div class="detail-field"><dt>Código / referencia</dt><dd>${escapeHTML(product.code || product.reference || product.sku || product.id)}</dd></div>
        ${extraFields}
      </dl>
    </div>
  `;
  attachImageFallbacks(els.productDetailContent);
}

function openProductDetails(productId) {
  const product = getProduct(productId);
  if (!product) {
    alert('El producto ya no está disponible. Actualiza el catálogo.');
    return;
  }
  els.productDetailDialog.dataset.productId = product.id;
  renderProductDetails(product);
  if (!els.productDetailDialog.open) {
    els.productDetailDialog.showModal();
  }
  els.closeProductDetailBtn.focus();
}

function refreshOpenProductDetails() {
  if (!els.productDetailDialog.open) return;
  const product = getProduct(els.productDetailDialog.dataset.productId);
  if (product) {
    renderProductDetails(product);
  } else {
    els.productDetailDialog.close();
  }
}

function closeProductDetails() {
  if (els.productDetailDialog.open) els.productDetailDialog.close();
}

function addHomeItem(productId, amount = 1) {
  const product = getProduct(productId);
  const quantity = Number(amount);
  if (!product || !Number.isInteger(quantity) || quantity <= 0) {
    alert('Selecciona un producto y una cantidad válida.');
    return;
  }
  const existing = appState.homeCart.find((item) => item.product_id === product.id);
  const nextQuantity = (existing?.quantity || 0) + quantity;
  if (nextQuantity > Number(product.quantity)) {
    alert(`Solo hay ${Number(product.quantity)} unidades disponibles de ${product.name}.`);
    return;
  }
  if (existing) existing.quantity = nextQuantity;
  else appState.homeCart.push({ product_id: product.id, quantity });
  renderHomeCatalog();
  renderHomeCart();
}

function changeHomeItem(productId, delta) {
  const item = appState.homeCart.find((entry) => entry.product_id === productId);
  const product = getProduct(productId);
  if (!item) return;
  const nextQuantity = item.quantity + delta;
  if (delta > 0 && (!product || nextQuantity > Number(product.quantity))) {
    alert(`No hay más unidades disponibles de ${product?.name || 'este producto'}.`);
    return;
  }
  if (nextQuantity <= 0) {
    appState.homeCart = appState.homeCart.filter((entry) => entry.product_id !== productId);
  } else {
    item.quantity = nextQuantity;
  }
  renderHomeCatalog();
  renderHomeCart();
}

async function transferHomeCartToSales() {
  if (!appState.homeCart.length) return;
  try {
    await loadProducts();
    const invalid = appState.homeCart.find((item) => {
      const product = getProduct(item.product_id);
      return !product || item.quantity > Number(product.quantity);
    });
    if (invalid) {
      const product = getProduct(invalid.product_id);
      alert(`No se puede transferir el carrito: ${product?.name || 'Un producto'} ya no tiene existencias suficientes. Ajusta las cantidades.`);
      return;
    }

    const combined = appState.draftItems.map((item) => ({ ...item }));
    for (const homeItem of appState.homeCart) {
      const product = getProduct(homeItem.product_id);
      const existing = combined.find((item) => item.product_id === homeItem.product_id);
      const quantity = homeItem.quantity + (existing?.quantity || 0);
      if (quantity > Number(product.quantity)) {
        alert(`No se puede transferir el carrito: ${product.name} excedería las ${Number(product.quantity)} unidades disponibles al combinarse con Ventas.`);
        return;
      }
      if (existing) {
        existing.quantity = quantity;
        existing.unit_price = Number(product.price);
        existing.name = product.name;
        existing.total = existing.quantity * existing.unit_price;
      } else {
        combined.push({
          product_id: product.id,
          name: product.name,
          unit_price: Number(product.price),
          quantity: homeItem.quantity,
          total: Number(product.price) * homeItem.quantity,
        });
      }
    }

    const invalidCombinedItem = combined.find((item) => {
      const product = getProduct(item.product_id);
      return !product || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > Number(product.quantity);
    });
    if (invalidCombinedItem) {
      const product = getProduct(invalidCombinedItem.product_id);
      alert(`No se puede transferir el carrito: ${product?.name || 'Un producto'} ya no tiene existencias suficientes en Ventas.`);
      return;
    }

    appState.draftItems = combined;
    appState.homeCart = [];
    renderHomeCart();
    renderHomeCatalog();
    renderDraftItems();
    setView('sales');
  } catch (error) {
    alert(`No se pudieron validar las existencias actuales: ${error.message}`);
  }
}

async function loadSales() {
  const sales = await apiFetch('/api/sales');
  appState.sales = sales;
  renderSalesHistory();
}

function renderSalesHistory() {
  const filterDate = els.salesDateFilter.value;
  const filtered = filterDate
    ? appState.sales.filter((sale) => (sale.created_at || sale.date || '').startsWith(filterDate))
    : appState.sales;

  if (!filtered.length) {
    els.salesHistoryBody.innerHTML = '<tr><td colspan="5">No hay ventas registradas.</td></tr>';
    return;
  }

  els.salesHistoryBody.innerHTML = filtered
    .map((sale) => {
      const items = sale.items || sale.sale_details || [];
      const text = items
        .map((item) => `${item.product_name || item.products?.name || 'Producto'} x${item.quantity}`)
        .join(', ');
      const total = sale.total || 0;
      const date = sale.created_at || sale.date;
      const seller = sale.seller || sale.seller_id || 'Vendedor';
      return `
        <tr>
          <td>${sale.id}</td>
          <td>${new Date(date).toLocaleString('es-CL')}</td>
          <td>${seller}</td>
          <td>${text}</td>
          <td>${formatMoney(total)}</td>
        </tr>
      `;
    })
    .join('');
}

function populateSalesSelector() {
  const options = appState.products
    .map((product) => `<option value="${product.id}">${product.name} (${product.quantity} disponibles)</option>`)
    .join('');
  els.saleProduct.innerHTML = options || '<option value="">Sin productos</option>';
}

async function handleProductSubmit(event) {
  event.preventDefault();
  const id = els.productId.value;
  const selectedFile = els.productImageFile.files[0];
  const payload = {
    name: els.productName.value,
    description: els.productDescription.value,
    category: els.productCategory.value,
    price: Number(els.productPrice.value),
    quantity: Number(els.productQuantity.value),
    min_stock: Number(els.productMinStock.value),
    image_url: els.productImageUrl.value,
  };

  try {
    let result;
    if (id) {
      result = await apiFetch(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      result = await apiFetch('/api/products', { method: 'POST', body: JSON.stringify(payload) });
    }

    const productId = id || result.product?.id;
    if (selectedFile && productId) {
      const formData = new FormData();
      formData.append('file', selectedFile);
      await apiFetch(`/api/products/${productId}/image`, { method: 'POST', body: formData });
    }

    resetProductForm();
    await loadProducts();
    await loadDashboard();
    setView('products');
  } catch (error) {
    alert(error.message);
  }
}

async function deleteProduct(productId) {
  if (!confirm('¿Deseas eliminar este producto?')) return;
  try {
    await apiFetch(`/api/products/${productId}`, { method: 'DELETE' });
    await loadProducts();
    await loadDashboard();
  } catch (error) {
    alert(error.message);
  }
}

function fillProductForm(productId) {
  const product = getProduct(productId);
  if (!product) return;
  els.productId.value = product.id;
  els.productName.value = product.name;
  els.productDescription.value = product.description;
  els.productCategory.value = product.category;
  els.productPrice.value = product.price;
  els.productQuantity.value = product.quantity;
  els.productMinStock.value = product.min_stock;
  els.productImageUrl.value = product.image_url || '';
  els.productImageFile.value = '';
  releaseProductImagePreview();
  renderProductImagePreview(product.image_url || '');
  setView('products');
}

function resetProductForm() {
  els.productForm.reset();
  els.productId.value = '';
  els.productImageFile.value = '';
  releaseProductImagePreview();
  renderProductImagePreview('');
}

function releaseProductImagePreview() {
  if (appState.productImagePreviewUrl) {
    URL.revokeObjectURL(appState.productImagePreviewUrl);
    appState.productImagePreviewUrl = '';
  }
}

function renderProductImagePreview(imageUrl) {
  const url = String(imageUrl || '').trim();
  if (!url) {
    els.productImagePreviewWrap.classList.add('hidden');
    els.productImagePreview.removeAttribute('src');
    return;
  }
  els.productImagePreview.src = url;
  els.productImagePreviewWrap.classList.remove('hidden');
  els.productImagePreview.onerror = () => {
    els.productImagePreviewWrap.classList.add('preview-error');
  };
  els.productImagePreview.onload = () => {
    els.productImagePreviewWrap.classList.remove('preview-error');
  };
}

function handleProductImageSelection() {
  const file = els.productImageFile.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    els.productImageFile.value = '';
    alert('Selecciona un archivo de imagen válido.');
    return;
  }
  releaseProductImagePreview();
  appState.productImagePreviewUrl = URL.createObjectURL(file);
  renderProductImagePreview(appState.productImagePreviewUrl);
}

function clearSelectedProductImage() {
  releaseProductImagePreview();
  els.productImageFile.value = '';
  renderProductImagePreview(els.productImageUrl.value);
}

function updateDraftTotal() {
  const total = appState.draftItems.reduce((sum, item) => sum + item.total, 0);
  els.saleTotal.textContent = formatMoney(total);
}

function renderDraftItems() {
  if (!appState.draftItems.length) {
    els.saleItemsBody.innerHTML = '<tr><td colspan="5">No hay productos agregados.</td></tr>';
    updateDraftTotal();
    return;
  }

  appState.draftItems = appState.draftItems.map((item) => {
    const product = getProduct(item.product_id);
    if (!product) return item;
    return {
      ...item,
      name: product.name,
      unit_price: Number(product.price),
      total: Number(product.price) * item.quantity,
    };
  });
  els.saleItemsBody.innerHTML = appState.draftItems
    .map(
      (item) => `
        <tr>
          <td><button type="button" class="product-name-button" data-open-product="${escapeHTML(item.product_id)}">${escapeHTML(item.name)}</button></td>
          <td>${item.quantity}</td>
          <td>${formatMoney(item.unit_price)}</td>
          <td>${formatMoney(item.total)}</td>
          <td>
            <div class="table-actions">
              <button type="button" class="quantity-btn" data-sale-decrease="${escapeHTML(item.product_id)}" aria-label="Reducir cantidad">−</button>
              <button type="button" class="quantity-btn" data-sale-increase="${escapeHTML(item.product_id)}" aria-label="Aumentar cantidad" ${!getProduct(item.product_id) || item.quantity >= Number(getProduct(item.product_id).quantity) ? 'disabled' : ''}>+</button>
              <button type="button" class="icon-btn remove-cart-item-btn" data-sale-remove="${escapeHTML(item.product_id)}">Eliminar</button>
            </div>
          </td>
        </tr>
      `
    )
    .join('');
  updateDraftTotal();
}

function addSaleItem() {
  const productId = els.saleProduct.value;
  const quantity = Number(els.saleQuantity.value || 0);
  if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
    alert('Selecciona un producto y una cantidad válida');
    return;
  }

  const product = getProduct(productId);
  if (!product) {
    alert('Producto no encontrado');
    return;
  }

  const existing = appState.draftItems.find((item) => item.product_id === productId);
  const nextQuantity = quantity + (existing?.quantity || 0);
  if (nextQuantity > Number(product.quantity)) {
    alert(`Solo hay ${Number(product.quantity)} unidades disponibles de ${product.name}.`);
    return;
  }

  if (existing) {
    existing.quantity = nextQuantity;
    existing.unit_price = Number(product.price);
    existing.total = existing.quantity * existing.unit_price;
  } else {
    appState.draftItems.push({
      product_id: product.id,
      name: product.name,
      unit_price: Number(product.price),
      quantity,
      total: Number(product.price) * quantity,
    });
  }

  renderDraftItems();
  els.saleQuantity.value = 1;
}

function changeSaleItem(productId, delta) {
  const item = appState.draftItems.find((entry) => entry.product_id === productId);
  if (!item) return;
  const product = getProduct(productId);
  const nextQuantity = item.quantity + delta;
  if (delta > 0 && (!product || nextQuantity > Number(product.quantity))) {
    alert(`No hay más unidades disponibles de ${product?.name || 'este producto'}.`);
    return;
  }
  if (nextQuantity <= 0) {
    appState.draftItems = appState.draftItems.filter((entry) => entry.product_id !== productId);
  } else {
    item.quantity = nextQuantity;
  }
  renderDraftItems();
}

async function confirmSale() {
  if (!appState.draftItems.length || appState.saleSubmitting) {
    alert('Agrega productos antes de confirmar la venta');
    return;
  }

  appState.saleSubmitting = true;
  els.confirmSaleBtn.disabled = true;
  try {
    await loadProducts();
    const invalid = appState.draftItems.find((item) => {
      const product = getProduct(item.product_id);
      return !product || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > Number(product.quantity);
    });
    if (invalid) {
      const product = getProduct(invalid.product_id);
      alert(`No se puede registrar la venta: ${product?.name || 'Un producto'} ya no tiene existencias suficientes. Ajusta el carrito.`);
      return;
    }

    const payload = {
      items: appState.draftItems.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
      notes: els.saleNotes.value.trim(),
    };

    await apiFetch('/api/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    appState.draftItems = [];
    els.saleNotes.value = '';
    renderDraftItems();
    setView('history');
    try {
      await Promise.all([loadDashboard(), loadProducts(), loadSales()]);
    } catch (refreshError) {
      alert(`La venta se registró, pero no se pudieron actualizar todos los datos: ${refreshError.message}`);
    }
  } catch (error) {
    alert(error.message);
  } finally {
    appState.saleSubmitting = false;
    els.confirmSaleBtn.disabled = false;
  }
}

async function updateInventoryQuantity(productId) {
  const product = getProduct(productId);
  if (!product) return;
  const nextValue = prompt(`Ingrese la nueva cantidad para ${product.name}`, product.quantity);
  if (nextValue === null) return;

  const quantity = Number(nextValue);
  if (Number.isNaN(quantity) || quantity < 0) {
    alert('Cantidad inválida');
    return;
  }

  try {
    await apiFetch(`/api/products/${productId}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
    await Promise.all([loadProducts(), loadDashboard()]);
  } catch (error) {
    alert(error.message);
  }
}

async function handleAssistantSubmit(event) {
  event.preventDefault();
  const question = els.assistantInput.value.trim();
  if (!question) return;

  appendAssistantMessage('user', question);
  els.assistantInput.value = '';

  try {
    const response = await apiFetch('/api/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message: question }),
    });
    appendAssistantMessage('bot', response.answer);
  } catch (error) {
    appendAssistantMessage('bot', error.message);
  }
}

function appendAssistantMessage(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `assistant-message ${role}`;
  bubble.textContent = text;
  els.assistantMessages.appendChild(bubble);
  els.assistantMessages.scrollTop = els.assistantMessages.scrollHeight;
}

els.loginForm.addEventListener('submit', handleLogin);
els.logoutBtn.addEventListener('click', async () => {
  try {
    await clearSession();
    showLogin();
  } catch (error) {
    alert(`No se pudo cerrar la sesión de Supabase: ${error.message}`);
  }
});
els.navigation.forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});
document.querySelectorAll('[data-view]:not(.nav-item)').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});
els.productSearch.addEventListener('input', renderProductTable);
els.productCategoryFilter.addEventListener('change', renderProductTable);
els.homeProductSearch.addEventListener('input', renderHomeCatalog);
els.homeCategoryFilter.addEventListener('change', renderHomeCatalog);
els.productForm.addEventListener('submit', handleProductSubmit);
els.cancelProductBtn.addEventListener('click', resetProductForm);
els.productImageFile.addEventListener('change', handleProductImageSelection);
els.productImageUrl.addEventListener('input', () => {
  if (!appState.productImagePreviewUrl) renderProductImagePreview(els.productImageUrl.value);
});
els.removeProductImageBtn.addEventListener('click', clearSelectedProductImage);
els.newProductBtn.addEventListener('click', () => {
  resetProductForm();
  setView('products');
});
els.addSaleItemBtn.addEventListener('click', addSaleItem);
els.confirmSaleBtn.addEventListener('click', confirmSale);
els.clearHomeCartBtn.addEventListener('click', () => {
  appState.homeCart = [];
  renderHomeCart();
  renderHomeCatalog();
});
els.continueToSalesBtn.addEventListener('click', transferHomeCartToSales);
els.closeProductDetailBtn.addEventListener('click', closeProductDetails);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && els.productDetailDialog.open) {
    event.preventDefault();
    closeProductDetails();
  }
});
els.productDetailDialog.addEventListener('click', (event) => {
  if (event.target === els.productDetailDialog) closeProductDetails();
});
document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.openProduct) openProductDetails(target.dataset.openProduct);
  else if (target.dataset.homeAdd) addHomeItem(target.dataset.homeAdd);
  else if (target.dataset.homeIncrease) changeHomeItem(target.dataset.homeIncrease, 1);
  else if (target.dataset.homeDecrease) changeHomeItem(target.dataset.homeDecrease, -1);
  else if (target.dataset.homeRemove) {
    appState.homeCart = appState.homeCart.filter((item) => item.product_id !== target.dataset.homeRemove);
    renderHomeCart();
    renderHomeCatalog();
  } else if (target.dataset.saleIncrease) changeSaleItem(target.dataset.saleIncrease, 1);
  else if (target.dataset.saleDecrease) changeSaleItem(target.dataset.saleDecrease, -1);
  else if (target.dataset.saleRemove) {
    appState.draftItems = appState.draftItems.filter((item) => item.product_id !== target.dataset.saleRemove);
    renderDraftItems();
  } else if (target.dataset.editId) fillProductForm(target.dataset.editId);
  else if (target.dataset.deleteId) deleteProduct(target.dataset.deleteId);
  else if (target.dataset.stockId) updateInventoryQuantity(target.dataset.stockId);
});
els.salesDateFilter.addEventListener('change', renderSalesHistory);
document.querySelector('#clear-sales-filter').addEventListener('click', () => {
  els.salesDateFilter.value = '';
  renderSalesHistory();
});
els.assistantForm.addEventListener('submit', handleAssistantSubmit);

bootstrap();
