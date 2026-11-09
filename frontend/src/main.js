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
  productSubmitting: false,
  productImages: [],
  removedProductImageUrls: [],
  productImagePreviewUrls: [],
  productGalleryIndex: 0,
  activeOperations: new Map(),
  toastTimeout: null,
  deletingProducts: new Set(),
  updatingInventory: new Set(),
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
  statOutOfStock: document.querySelector('#stat-out-of-stock'),
  operationIndicator: document.querySelector('#operation-indicator'),
  operationIndicatorText: document.querySelector('#operation-indicator-text'),
  operationToast: document.querySelector('#operation-toast'),
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
  inventorySearch: document.querySelector('#inventory-search'),
  inventoryCategoryFilter: document.querySelector('#inventory-category-filter'),
  inventoryStatusFilter: document.querySelector('#inventory-status-filter'),
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
  productImageGallery: document.querySelector('#product-image-gallery'),
  productDetailDialog: document.querySelector('#product-detail-dialog'),
  productDetailContent: document.querySelector('#product-detail-content'),
  productGalleryControls: document.querySelector('#product-gallery-controls'),
  productGalleryPrevious: document.querySelector('#product-gallery-previous'),
  productGalleryNext: document.querySelector('#product-gallery-next'),
  productGalleryCount: document.querySelector('#product-gallery-count'),
  closeProductDetailBtn: document.querySelector('#close-product-detail-btn'),
  saleForm: document.querySelector('#sale-form'),
  saleProduct: document.querySelector('#sale-product'),
  saleQuantity: document.querySelector('#sale-quantity'),
  saleItemsBody: document.querySelector('#sale-items-body'),
  saleTotal: document.querySelector('#sale-total'),
  saleNotes: document.querySelector('#sale-notes'),
  saleBuyerName: document.querySelector('#sale-buyer-name'),
  salePaymentMethod: document.querySelector('#sale-payment-method'),
  salesHistoryBody: document.querySelector('#sales-history-body'),
  salesDateFilter: document.querySelector('#sales-date-filter'),
  salesSearchFilter: document.querySelector('#sales-search-filter'),
  saleDetailDialog: document.querySelector('#sale-detail-dialog'),
  saleDetailContent: document.querySelector('#sale-detail-content'),
  closeSaleDetailBtn: document.querySelector('#close-sale-detail-btn'),
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
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
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
  const imageUrl = String(product.image_url || product.image_urls?.[0] || '').trim();
  if (!imageUrl) {
    return `<div class="${className} image-placeholder" aria-label="Producto sin imagen">Sin imagen</div>`;
  }
  return `<img class="${className} product-image" src="${escapeHTML(imageUrl)}" alt="${escapeHTML(product.name || 'Imagen del producto')}" loading="lazy" />`;
}

function getProductImageUrls(product) {
  const urls = Array.isArray(product.image_urls)
    ? product.image_urls.filter((url) => typeof url === 'string' && url.trim())
    : [];
  const uniqueUrls = [...new Set(urls)];
  const cover = String(product.image_url || '').trim();
  if (cover) {
    const coverIndex = uniqueUrls.indexOf(cover);
    if (coverIndex >= 0) uniqueUrls.splice(coverIndex, 1);
    uniqueUrls.unshift(cover);
  }
  return uniqueUrls.slice(0, 5);
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
  for (const select of [els.productCategoryFilter, els.homeCategoryFilter, els.inventoryCategoryFilter]) {
    const currentValue = select.value;
    select.innerHTML = '<option value="">Todas las categorías</option>' +
      categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
    select.value = categories.includes(currentValue) ? currentValue : '';
  }
}

function startOperation(label) {
  const operationId = Symbol(label);
  appState.activeOperations.set(operationId, label);
  els.operationIndicatorText.textContent = appState.activeOperations.values().next().value || label;
  els.operationIndicator.classList.remove('hidden');
  return () => {
    appState.activeOperations.delete(operationId);
    if (appState.activeOperations.size) {
      els.operationIndicatorText.textContent = appState.activeOperations.values().next().value;
    } else {
      els.operationIndicator.classList.add('hidden');
    }
  };
}

function showToast(message, type = 'success') {
  window.clearTimeout(appState.toastTimeout);
  els.operationToast.textContent = message;
  els.operationToast.className = `operation-toast ${type}`;
  appState.toastTimeout = window.setTimeout(() => {
    els.operationToast.classList.add('hidden');
  }, 5000);
}

function setControlsDisabled(container, disabled) {
  container.querySelectorAll('input, textarea, select, button').forEach((control) => {
    if (disabled) {
      control.dataset.wasDisabled = String(control.disabled);
      control.disabled = true;
    } else {
      control.disabled = control.dataset.wasDisabled === 'true';
      delete control.dataset.wasDisabled;
    }
  });
}

function setButtonBusy(button, busy, label = 'Procesando...') {
  if (!button) return;
  if (busy) {
    if (button.dataset.busy === 'true') return;
    button.dataset.busy = 'true';
    button.dataset.originalContent = button.innerHTML;
    button.dataset.originalDisabled = String(button.disabled);
    button.disabled = true;
    button.innerHTML = `<span class="button-loading"><span class="loading-spinner" aria-hidden="true"></span>${escapeHTML(label)}</span>`;
    return;
  }
  if (button.dataset.busy !== 'true') return;
  button.innerHTML = button.dataset.originalContent || '';
  button.disabled = button.dataset.originalDisabled === 'true';
  delete button.dataset.busy;
  delete button.dataset.originalContent;
  delete button.dataset.originalDisabled;
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
  const finishLoading = startOperation('Cargando métricas...');
  try {
    const dashboard = await apiFetch('/api/dashboard');
    els.statProducts.textContent = dashboard.products_count;
    els.statSalesDay.textContent = dashboard.sales_today;
    els.statLowStock.textContent = dashboard.low_stock_count;
    els.statOutOfStock.textContent = dashboard.out_of_stock_count;
  } finally {
    finishLoading();
  }
}

async function loadProducts() {
  const finishLoading = startOperation('Cargando catálogo e inventario...');
  try {
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
  } finally {
    finishLoading();
  }
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
  const search = els.inventorySearch.value.trim().toLocaleLowerCase();
  const category = els.inventoryCategoryFilter.value;
  const statusFilter = els.inventoryStatusFilter.value;
  const list = appState.products
    .filter((product) => {
      const quantity = Number(product.quantity);
      const minimum = Number(product.min_stock);
      const matchesName = !search || String(product.name || '').toLocaleLowerCase().includes(search);
      const matchesCategory = !category || product.category === category;
      const matchesStatus = !statusFilter
        || (statusFilter === 'out' && quantity === 0)
        || (statusFilter === 'low' && quantity > 0 && quantity <= minimum)
        || (statusFilter === 'available' && quantity > minimum);
      return matchesName && matchesCategory && matchesStatus;
    })
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
    'image_url', 'image_urls', 'created_at', 'updated_at',
  ]);
  const extraFields = Object.entries(product)
    .filter(([key, value]) => !coreFields.has(key) && value !== null && typeof value !== 'object')
    .map(([key, value]) => `<div class="detail-field"><dt>${escapeHTML(key.replaceAll('_', ' '))}</dt><dd>${escapeHTML(value)}</dd></div>`)
    .join('');
  const imageUrls = getProductImageUrls(product);
  const galleryIndex = Math.min(Number(els.productDetailDialog.dataset.galleryIndex || 0), Math.max(0, imageUrls.length - 1));
  els.productDetailDialog.dataset.galleryIndex = String(galleryIndex);
  const imageUrl = imageUrls[galleryIndex];
  const image = imageUrl
    ? imageMarkup({ ...product, image_url: imageUrl }, 'product-detail-image')
    : '<div class="product-detail-image image-placeholder">Sin imagen</div>';

  els.productDetailContent.innerHTML = `
    ${image}
    <div class="product-detail-copy">
      <p class="eyebrow">${escapeHTML(product.category || 'Producto')}</p>
      <h2 id="product-detail-title">${escapeHTML(product.name || 'Producto')}</h2>
      <dl class="product-detail-fields">
        <div class="detail-field"><dt>Categoría</dt><dd>${escapeHTML(product.category || 'Sin categoría')}</dd></div>
        <div class="detail-field"><dt>Precio</dt><dd>${formatMoney(product.price)}</dd></div>
        <div class="detail-field"><dt>Existencias</dt><dd>${Number(product.quantity || 0)}</dd></div>
        <div class="detail-field"><dt>Código / referencia</dt><dd>${escapeHTML(product.code || product.reference || product.sku || product.id)}</dd></div>
        ${extraFields}
      </dl>
      <section class="product-detail-description">
        <h3>Descripción</h3>
        <p>${escapeHTML(product.description || 'Sin descripción disponible.')}</p>
      </section>
    </div>
  `;
  els.productGalleryControls.classList.toggle('hidden', imageUrls.length <= 1);
  els.productGalleryCount.textContent = imageUrls.length > 1 ? `${galleryIndex + 1} de ${imageUrls.length}` : '';
  attachImageFallbacks(els.productDetailContent);
}

function openProductDetails(productId) {
  const product = getProduct(productId);
  if (!product) {
    alert('El producto ya no está disponible. Actualiza el catálogo.');
    return;
  }
  els.productDetailDialog.dataset.productId = product.id;
  els.productDetailDialog.dataset.galleryIndex = '0';
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

function changeProductGalleryImage(direction) {
  const product = getProduct(els.productDetailDialog.dataset.productId);
  if (!product) return;
  const imageCount = getProductImageUrls(product).length;
  if (imageCount <= 1) return;
  const currentIndex = Number(els.productDetailDialog.dataset.galleryIndex || 0);
  els.productDetailDialog.dataset.galleryIndex = String((currentIndex + direction + imageCount) % imageCount);
  renderProductDetails(product);
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
  const finishLoading = startOperation('Cargando historial de ventas...');
  try {
    const sales = await apiFetch('/api/sales');
    appState.sales = sales;
    renderSalesHistory();
  } finally {
    finishLoading();
  }
}

function renderSalesHistory() {
  const filterDate = els.salesDateFilter.value;
  const search = els.salesSearchFilter.value.trim().toLocaleLowerCase();
  const filtered = appState.sales.filter((sale) => {
    const matchesDate = !filterDate || (sale.created_at || sale.date || '').startsWith(filterDate);
    const paymentMethod = String(sale.payment_method || '');
    const paymentLabel = getPaymentMethodLabel(paymentMethod);
    const searchableFields = `${sale.id || ''} ${sale.buyer_name || ''} ${paymentMethod} ${paymentLabel}`.toLocaleLowerCase();
    return matchesDate && (!search || searchableFields.includes(search));
  });

  if (!filtered.length) {
    els.salesHistoryBody.innerHTML = '<tr><td colspan="6">No hay ventas con esos filtros.</td></tr>';
    return;
  }

  els.salesHistoryBody.innerHTML = filtered
    .map((sale) => {
      const total = sale.total || 0;
      const date = sale.created_at || sale.date;
      const seller = getSaleSellerName(sale);
      const paymentMethod = getPaymentMethodLabel(sale.payment_method);
      return `
        <tr>
          <td>${escapeHTML(sale.id)}</td>
          <td>${new Date(date).toLocaleString('es-CO')}</td>
          <td>${escapeHTML(seller)}</td>
          <td>${escapeHTML(paymentMethod)}</td>
          <td>${formatMoney(total)}</td>
          <td><button type="button" class="action-btn" data-sale-details="${escapeHTML(sale.id)}">Ver productos</button></td>
        </tr>
      `;
    })
    .join('');
}

function getSaleSellerName(sale) {
  const sellerName = String(sale.seller_name || '').trim();
  const seller = String(sale.seller || '').trim();
  const sellerEmail = String(sale.seller_email || '').trim();
  const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const name = sellerName || seller;
  if (name && !uuidPattern.test(name)) return name;
  return sellerEmail || 'Vendedor';
}

function getPaymentMethodLabel(paymentMethod) {
  const labels = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
  };
  const method = String(paymentMethod || '').trim().toLocaleLowerCase();
  return labels[method] || (method ? String(paymentMethod) : 'No especificado');
}

function openSaleDetails(saleId) {
  const sale = appState.sales.find((entry) => String(entry.id) === String(saleId));
  if (!sale) {
    showToast('No se encontró la venta seleccionada. Actualiza el historial e inténtalo de nuevo.', 'error');
    return;
  }
  const items = Array.isArray(sale.items)
    ? sale.items
    : Array.isArray(sale.sale_details) ? sale.sale_details : [];
  const itemRows = items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    const subtotal = Number(item.subtotal ?? item.total ?? unitPrice * quantity);
    const productName = item.product_name || item.products?.name || 'Producto';
    return `
      <tr>
        <td>${escapeHTML(productName)}</td>
        <td>${quantity}</td>
        <td>${formatMoney(unitPrice)}</td>
        <td>${formatMoney(subtotal)}</td>
      </tr>
    `;
  }).join('');

  els.saleDetailContent.innerHTML = `
    <p class="eyebrow">Detalle de venta</p>
    <h2 id="sale-detail-title">Venta ${escapeHTML(sale.id)}</h2>
    <div class="sale-detail-table-wrap">
      <table class="sale-detail-table">
        <thead>
          <tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr>
        </thead>
        <tbody>${itemRows || '<tr><td colspan="4">No hay productos registrados para esta venta.</td></tr>'}</tbody>
      </table>
    </div>
    <p class="sale-detail-total"><span>Total de la venta</span><strong>${formatMoney(sale.total)}</strong></p>
  `;
  if (!els.saleDetailDialog.open) els.saleDetailDialog.showModal();
  els.closeSaleDetailBtn.focus();
}

function closeSaleDetails() {
  if (els.saleDetailDialog.open) els.saleDetailDialog.close();
}

function populateSalesSelector() {
  const options = appState.products
    .map((product) => `<option value="${product.id}">${product.name} (${product.quantity} disponibles)</option>`)
    .join('');
  els.saleProduct.innerHTML = options || '<option value="">Sin productos</option>';
}

async function handleProductSubmit(event) {
  event.preventDefault();
  if (appState.productSubmitting) return;
  appState.productSubmitting = true;
  const finishLoading = startOperation(els.productId.value ? 'Actualizando producto...' : 'Registrando producto...');
  const submitButton = els.productForm.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, 'Guardando producto...');
  setButtonBusy(els.newProductBtn, true, 'Guardando...');
  setControlsDisabled(els.productForm, true);
  const id = els.productId.value;
  const pendingImages = appState.productImages.filter((image) => image.file);
  const selectedCover = appState.productImages[0];
  const imageUrls = appState.productImages.filter((image) => !image.file).map((image) => image.url);
  const coverUrl = els.productImageUrl.value.trim();
  if (coverUrl && !imageUrls.includes(coverUrl)) imageUrls.unshift(coverUrl);
  if (imageUrls.length + pendingImages.length > 5) {
    showToast('Cada producto puede tener como máximo 5 imágenes.', 'error');
    appState.productSubmitting = false;
    setControlsDisabled(els.productForm, false);
    setButtonBusy(submitButton, false);
    setButtonBusy(els.newProductBtn, false);
    finishLoading();
    return;
  }
  const payload = {
    name: els.productName.value,
    description: els.productDescription.value,
    category: els.productCategory.value,
    price: Number(els.productPrice.value),
    quantity: Number(els.productQuantity.value),
    min_stock: Number(els.productMinStock.value),
    image_url: selectedCover?.file ? '' : (coverUrl || imageUrls[0] || ''),
    image_urls: imageUrls,
    removed_image_urls: appState.removedProductImageUrls,
  };

  let productSaved = false;
  try {
    let result;
    if (id) {
      result = await apiFetch(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      result = await apiFetch('/api/products', { method: 'POST', body: JSON.stringify(payload) });
    }

    const productId = id || result.product?.id;
    if (!productId) throw new Error('El servidor no devolvió el identificador del producto.');
    productSaved = true;
    els.productId.value = productId;
    if (pendingImages.length) {
      const formData = new FormData();
      pendingImages.forEach((image) => formData.append('files', image.file));
      formData.append('cover_index', String(selectedCover?.file ? pendingImages.indexOf(selectedCover) : -1));
      await apiFetch(`/api/products/${productId}/images`, { method: 'POST', body: formData });
    }

    resetProductForm();
    await loadProducts();
    await loadDashboard();
    showToast(id ? 'Producto actualizado correctamente.' : 'Producto registrado correctamente.');
  } catch (error) {
    showToast(
      productSaved
        ? `El producto se guardó, pero no se completó toda la operación: ${error.message}`
        : error.message,
      'error',
    );
    if (productSaved) {
      try {
        await loadProducts();
      } catch (refreshError) {
        console.error('No se pudo actualizar el catálogo después de guardar el producto.', refreshError);
      }
    }
  } finally {
    appState.productSubmitting = false;
    setControlsDisabled(els.productForm, false);
    setButtonBusy(submitButton, false);
    setButtonBusy(els.newProductBtn, false);
    finishLoading();
  }
}

async function deleteProduct(productId, button = null) {
  if (appState.deletingProducts.has(productId)) return;
  if (!confirm('¿Deseas eliminar este producto?')) return;
  appState.deletingProducts.add(productId);
  const finishLoading = startOperation('Eliminando producto...');
  setButtonBusy(button, true, 'Eliminando...');
  try {
    await apiFetch(`/api/products/${productId}`, { method: 'DELETE' });
    await Promise.all([loadProducts(), loadDashboard()]);
    showToast('Producto eliminado correctamente.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    appState.deletingProducts.delete(productId);
    setButtonBusy(button, false);
    finishLoading();
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
  appState.productImages = getProductImageUrls(product).map((url) => ({ url, file: null, preview: url }));
  appState.removedProductImageUrls = [];
  els.productImageUrl.value = product.image_url || '';
  els.productImageFile.value = '';
  renderProductImageGalleryEditor();
  setView('products');
}

function resetProductForm() {
  els.productForm.reset();
  els.productId.value = '';
  els.productImageFile.value = '';
  appState.productImages = [];
  appState.removedProductImageUrls = [];
  releaseProductImagePreviews();
  renderProductImageGalleryEditor();
}

function releaseProductImagePreviews() {
  appState.productImagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  appState.productImagePreviewUrls = [];
}

function renderProductImageGalleryEditor() {
  if (!appState.productImages.length) {
    els.productImageGallery.innerHTML = '<p class="demo-note">Aún no hay imágenes seleccionadas.</p>';
    return;
  }
  els.productImageGallery.innerHTML = appState.productImages.map((image, index) => `
    <article class="product-image-editor-item">
      <img class="product-image-editor-thumb product-image" src="${escapeHTML(image.preview)}" alt="Imagen ${index + 1} del producto" />
      <span>${index === 0 ? 'Portada' : `Imagen ${index + 1}`}${image.file ? ' · Pendiente de subir' : ''}</span>
      <div class="table-actions">
        ${index ? `<button type="button" class="icon-btn" data-image-cover="${index}">Usar de portada</button>` : ''}
        <button type="button" class="icon-btn" data-image-remove="${index}" aria-label="Quitar imagen ${index + 1}">Quitar</button>
      </div>
    </article>
  `).join('');
  attachImageFallbacks(els.productImageGallery);
}

function handleProductImageUrlInput() {
  const url = els.productImageUrl.value.trim();
  if (!url) return;
  const existingIndex = appState.productImages.findIndex((image) => image.url === url);
  if (existingIndex >= 0) {
    appState.productImages.unshift(appState.productImages.splice(existingIndex, 1)[0]);
    renderProductImageGalleryEditor();
    return;
  }
  if (appState.productImages.length >= 5) {
    showToast('Quita una imagen antes de agregar otra; el límite es 5.', 'error');
    els.productImageUrl.value = appState.productImages[0]?.url || '';
    return;
  }
  appState.productImages.unshift({ url, file: null, preview: url });
  renderProductImageGalleryEditor();
}

function handleProductImageSelection() {
  const files = Array.from(els.productImageFile.files || []);
  if (!files.length) return;
  const validFiles = files.filter((file) => file.type.startsWith('image/'));
  if (validFiles.length !== files.length) {
    showToast('Se omitieron archivos que no son imágenes.', 'error');
  }
  const availableSlots = Math.max(0, 5 - appState.productImages.length);
  const filesToAdd = validFiles.slice(0, availableSlots);
  if (filesToAdd.length < validFiles.length) {
    showToast('Cada producto puede tener como máximo 5 imágenes.', 'error');
  }
  filesToAdd.forEach((file) => {
    const preview = URL.createObjectURL(file);
    appState.productImagePreviewUrls.push(preview);
    appState.productImages.push({ url: '', file, preview });
  });
  els.productImageFile.value = '';
  renderProductImageGalleryEditor();
}

function removeProductImage(index) {
  const [image] = appState.productImages.splice(index, 1);
  if (!image) return;
  if (image.file) {
    URL.revokeObjectURL(image.preview);
    appState.productImagePreviewUrls = appState.productImagePreviewUrls.filter((url) => url !== image.preview);
  } else if (image.url && !appState.removedProductImageUrls.includes(image.url)) {
    appState.removedProductImageUrls.push(image.url);
  }
  els.productImageUrl.value = appState.productImages[0]?.url || '';
  renderProductImageGalleryEditor();
}

function setProductImageCover(index) {
  if (index < 0 || index >= appState.productImages.length) return;
  appState.productImages.unshift(appState.productImages.splice(index, 1)[0]);
  els.productImageUrl.value = appState.productImages[0].file ? '' : appState.productImages[0].url;
  renderProductImageGalleryEditor();
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
              <button type="button" class="quantity-btn" data-sale-decrease="${escapeHTML(item.product_id)}" aria-label="Reducir cantidad" ${appState.saleSubmitting ? 'disabled' : ''}>−</button>
              <button type="button" class="quantity-btn" data-sale-increase="${escapeHTML(item.product_id)}" aria-label="Aumentar cantidad" ${appState.saleSubmitting || !getProduct(item.product_id) || item.quantity >= Number(getProduct(item.product_id).quantity) ? 'disabled' : ''}>+</button>
              <button type="button" class="icon-btn remove-cart-item-btn" data-sale-remove="${escapeHTML(item.product_id)}" ${appState.saleSubmitting ? 'disabled' : ''}>Eliminar</button>
            </div>
          </td>
        </tr>
      `
    )
    .join('');
  updateDraftTotal();
}

function addSaleItem() {
  if (appState.saleSubmitting) return;
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
  if (appState.saleSubmitting) return;
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
  if (appState.saleSubmitting) return;
  if (!appState.draftItems.length) {
    alert('Agrega productos antes de confirmar la venta');
    return;
  }
  if (!els.salePaymentMethod.value) {
    els.salePaymentMethod.reportValidity();
    return;
  }

  appState.saleSubmitting = true;
  const finishLoading = startOperation('Registrando venta...');
  setControlsDisabled(els.saleForm, true);
  els.saleItemsBody.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  setButtonBusy(els.confirmSaleBtn, true, 'Registrando venta...');
  try {
    await loadProducts();
    const invalid = appState.draftItems.find((item) => {
      const product = getProduct(item.product_id);
      return !product || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > Number(product.quantity);
    });
    if (invalid) {
      const product = getProduct(invalid.product_id);
      showToast(`No se puede registrar la venta: ${product?.name || 'Un producto'} ya no tiene existencias suficientes. Ajusta el carrito.`, 'error');
      return;
    }

    const payload = {
      items: appState.draftItems.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
      notes: els.saleNotes.value.trim(),
      buyer_name: els.saleBuyerName.value.trim() || null,
      payment_method: els.salePaymentMethod.value,
    };

    await apiFetch('/api/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    appState.draftItems = [];
    els.saleNotes.value = '';
    els.saleBuyerName.value = '';
    els.salePaymentMethod.value = '';
    renderDraftItems();
    setView('history');
    try {
      await Promise.all([loadDashboard(), loadProducts(), loadSales()]);
      showToast('Venta registrada correctamente.');
    } catch (refreshError) {
      showToast(`La venta se registró, pero no se pudieron actualizar todos los datos: ${refreshError.message}`, 'error');
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    appState.saleSubmitting = false;
    setControlsDisabled(els.saleForm, false);
    setButtonBusy(els.confirmSaleBtn, false);
    renderDraftItems();
    finishLoading();
  }
}

async function updateInventoryQuantity(productId, button = null) {
  if (appState.updatingInventory.has(productId)) return;
  const product = getProduct(productId);
  if (!product) return;
  const nextValue = prompt(`Ingrese la nueva cantidad para ${product.name}`, product.quantity);
  if (nextValue === null) return;

  const quantity = Number(nextValue);
  if (Number.isNaN(quantity) || quantity < 0) {
    alert('Cantidad inválida');
    return;
  }

  appState.updatingInventory.add(productId);
  const finishLoading = startOperation('Actualizando existencias...');
  setButtonBusy(button, true, 'Actualizando...');
  try {
    await apiFetch(`/api/products/${productId}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
    await Promise.all([loadProducts(), loadDashboard()]);
    showToast('Existencias actualizadas correctamente.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    appState.updatingInventory.delete(productId);
    setButtonBusy(button, false);
    finishLoading();
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
els.productImageUrl.addEventListener('change', handleProductImageUrlInput);
els.inventorySearch.addEventListener('input', renderInventory);
els.inventoryCategoryFilter.addEventListener('change', renderInventory);
els.inventoryStatusFilter.addEventListener('change', renderInventory);
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
els.productGalleryPrevious.addEventListener('click', () => changeProductGalleryImage(-1));
els.productGalleryNext.addEventListener('click', () => changeProductGalleryImage(1));
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
  if (target.dataset.saleDetails) openSaleDetails(target.dataset.saleDetails);
  else if (target.dataset.openProduct) openProductDetails(target.dataset.openProduct);
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
    if (appState.saleSubmitting) return;
    appState.draftItems = appState.draftItems.filter((item) => item.product_id !== target.dataset.saleRemove);
    renderDraftItems();
  } else if (target.dataset.editId) fillProductForm(target.dataset.editId);
  else if (target.dataset.deleteId) deleteProduct(target.dataset.deleteId, target);
  else if (target.dataset.stockId) updateInventoryQuantity(target.dataset.stockId, target);
  else if (target.dataset.imageRemove !== undefined) removeProductImage(Number(target.dataset.imageRemove));
  else if (target.dataset.imageCover !== undefined) setProductImageCover(Number(target.dataset.imageCover));
});
els.closeSaleDetailBtn.addEventListener('click', closeSaleDetails);
els.saleDetailDialog.addEventListener('click', (event) => {
  if (event.target === els.saleDetailDialog) closeSaleDetails();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && els.saleDetailDialog.open) {
    event.preventDefault();
    closeSaleDetails();
  }
});
els.salesDateFilter.addEventListener('change', renderSalesHistory);
els.salesSearchFilter.addEventListener('input', renderSalesHistory);
document.querySelector('#clear-sales-filter').addEventListener('click', () => {
  els.salesDateFilter.value = '';
  els.salesSearchFilter.value = '';
  renderSalesHistory();
});
els.assistantForm.addEventListener('submit', handleAssistantSubmit);

bootstrap();
