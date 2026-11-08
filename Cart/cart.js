(function () {
    const CART_KEY = 'biterush_cart';
    const PRODUCT_OVERRIDES_KEY = 'biterush_product_overrides';
    const CUSTOM_PRODUCTS_KEY = 'biterush_custom_products';
    const normalizeTitle = title => String(title || '').trim().toLocaleLowerCase();
    const readArray = (key, fallback) => {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return Array.isArray(value) ? value : fallback;
        } catch (error) {
            console.error(`Unable to read ${key}:`, error);
            return fallback;
        }
    };
    const customProducts = readArray(CUSTOM_PRODUCTS_KEY, []);
    const getStock = title => {
        const override = productOverrides[normalizeTitle(title)];
        if (override && override.stock !== undefined && override.stock !== null && override.stock !== ''
            && Number.isFinite(Number(override.stock))) return Math.max(0, Number(override.stock));
        const customProduct = customProducts.find(product =>
            product && normalizeTitle(product.title) === normalizeTitle(title)
        );
        return customProduct && customProduct.stock !== undefined && customProduct.stock !== null && customProduct.stock !== ''
            && Number.isFinite(Number(customProduct.stock))
            ? Math.max(0, Number(customProduct.stock))
            : null;
    };
    const readObject = (key, fallback) => {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value && typeof value === 'object' ? value : fallback;
        } catch (error) {
            console.error(`Unable to read ${key}:`, error);
            return fallback;
        }
    };
    let productOverrides = readObject(PRODUCT_OVERRIDES_KEY, {});
    const readCart = () => {
        try {
            const value = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
            return Array.isArray(value)
                ? value
                    .filter(item => item && item.title && item.img)
                    .map(item => ({
                        ...item,
                        instructions: String(item.instructions || ''),
                        price: Number.isFinite(Number(
                            productOverrides[normalizeTitle(item.title)]?.price
                        ))
                            ? Number(productOverrides[normalizeTitle(item.title)].price)
                            : Number(item.price),
                        quantity: Number(item.quantity)
                    }))
                    .filter(item => Number.isFinite(item.price) && item.price >= 0
                        && Number.isSafeInteger(item.quantity) && item.quantity > 0)
                : [];
        } catch (error) {
            console.error('Unable to read cart:', error);
            return [];
        }
    };
    let cart = readCart();

    const saveCart = () => {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
        window.dispatchEvent(new CustomEvent('biterush-cart-updated'));
        render();
    };
    const money = value => `₱ ${Number(value).toFixed(0)}`;
    const itemKey = item => item.key || item.link || `${item.title}|${item.img}`;
    const add = item => {
        const override = productOverrides[normalizeTitle(item.title)];
        if (override && override.deleted === true) {
            window.alert(`${item.title} is not currently available.`);
            return false;
        }
        if (override && override.available === false) {
            window.alert(`${item.title} is currently unavailable.`);
            return false;
        }
        const stock = getStock(item.title);
        const currentQuantity = cart
            .filter(entry => itemKey(entry) === itemKey(item))
            .reduce((sum, entry) => sum + entry.quantity, 0);
        if (stock !== null && currentQuantity >= stock) {
            window.alert(stock === 0
                ? `${item.title} is currently out of stock.`
                : `Only ${stock} ${item.title} item${stock === 1 ? ' is' : 's are'} available.`);
            return false;
        }
        if (override && Number.isFinite(Number(override.price))) {
            item.price = Number(override.price);
        }
        item.img = new URL(item.img, location.href).href;
        item.key = itemKey(item);
        const existing = cart.find(entry => itemKey(entry) === item.key);
        if (existing) {
            existing.price = Number(item.price);
            existing.reviewTitle = item.reviewTitle || existing.reviewTitle || item.title;
            existing.quantity += 1;
        }
        else cart.push({ ...item, quantity: 1 });
        saveCart();
        return true;
    };
    const change = (title, amount) => {
        const item = cart.find(entry => itemKey(entry) === title);
        if (!item) return;
        if (amount > 0) {
            const stock = getStock(item.title);
            if (stock !== null && item.quantity >= stock) {
                window.alert(stock === 0
                    ? `${item.title} is currently out of stock.`
                    : `Only ${stock} ${item.title} item${stock === 1 ? ' is' : 's are'} available.`);
                return;
            }
        }
        item.quantity += amount;
        cart = cart.filter(entry => entry.quantity > 0);
        saveCart();
    };

    const existingButton = document.querySelector('.cart-btn');
    const button = existingButton || document.createElement('button');
    if (!existingButton) {
        button.className = 'shared-cart-toggle';
        button.type = 'button';
        button.setAttribute('aria-label', 'Shopping Cart');
        button.innerHTML = `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>`;
        document.body.appendChild(button);
    }
    const badge = button.querySelector('.cart-badge') || document.createElement('span');
    if (!badge.classList.contains('cart-badge')) {
        badge.className = 'shared-cart-badge';
        button.appendChild(badge);
    }
    const pathname = location.pathname.replace(/\\/g, '/');
    const isFoodDetailsPage = /\/FoodDetails\//i.test(pathname)
        || /\/BiteRushHomePage\/FoodDetailsHome\//i.test(pathname);
    const isMenuPage = /\/BiteRushFoodMenuPages\//i.test(pathname);
    const isProjectRootPage = pathname === '/'
        || /(?:^|\/)BiteRush\/(?:index\.html)?$/i.test(pathname);
    const checkoutPath = isFoodDetailsPage
        ? '../../../DeliveryAddress/index.html'
        : isMenuPage
            ? '../../DeliveryAddress/index.html'
            : isProjectRootPage
                ? 'DeliveryAddress/index.html'
                : '../DeliveryAddress/index.html';

    function applyProductSettings() {
        document.querySelectorAll('.food-card').forEach(card => {
            const title = card.dataset.title || card.querySelector('.food-title')?.textContent.trim();
            applyProductSetting(card, title);
        });
        document.querySelectorAll('.search-result-card').forEach(card => {
            const title = card.querySelector('h3')?.textContent.trim()
                || card.querySelector('.search-result-add')?.dataset.title;
            applyProductSetting(card, title);
        });
        const detailCard = document.querySelector('.item-card');
        if (detailCard) {
            applyProductSetting(detailCard, detailCard.querySelector('.item-title')?.textContent.trim());
        }
    }
    function applyProductSetting(card, title) {
        if (!title) return;
        const override = productOverrides[normalizeTitle(title)];
        if (!override) return;
        if (override.deleted === true) {
            card.querySelectorAll('.add-btn, .search-result-add, .shared-add-detail')
                .forEach(addButton => {
                    addButton.disabled = true;
                    addButton.setAttribute('aria-disabled', 'true');
                    addButton.title = 'Moved to the recycle bin';
                });
            if (!card.querySelector('.admin-unavailable-label')) {
                const notice = document.createElement('span');
                notice.className = 'admin-unavailable-label';
                notice.textContent = 'Recycle bin';
                card.appendChild(notice);
            }
        }
        if (Number.isFinite(Number(override.price))) {
            card.querySelectorAll('.price, .card-price, .search-result-price, .item-price, .food-price')
                .forEach(price => {
                    price.textContent = `₱ ${Number(override.price).toFixed(0)}`;
                });
            card.dataset.price = String(override.price);
            card.querySelectorAll('.add-btn, .search-result-add').forEach(addButton => {
                addButton.dataset.price = String(override.price);
            });
        }
        if (override.category) {
            card.querySelectorAll('.food-category, .search-result-category, .item-subtitle')
                .forEach(category => {
                    category.textContent = override.category;
                });
        }
        if (typeof override.description === 'string') {
            card.querySelectorAll('.food-description, .search-result-description, .item-description')
                .forEach(description => {
                    description.textContent = override.description;
                });
        }
        if (override.image) {
            const image = new URL(override.image, location.href).href;
            card.querySelectorAll('.food-img, .search-result-image img, .item-img')
                .forEach(imageElement => {
                    imageElement.src = image;
                });
            card.dataset.img = image;
            card.querySelectorAll('.add-btn, .search-result-add, .shared-add-detail')
                .forEach(addButton => {
                    addButton.dataset.img = image;
                });
        }
        if (override.available === false) {
            card.querySelectorAll('.add-btn, .search-result-add, .shared-add-detail')
                .forEach(addButton => {
                    addButton.disabled = true;
                    addButton.setAttribute('aria-disabled', 'true');
                    addButton.title = 'Currently unavailable';
                });
            if (!card.querySelector('.admin-unavailable-label')) {
                const notice = document.createElement('span');
                notice.className = 'admin-unavailable-label';
                notice.textContent = 'Currently unavailable';
                card.appendChild(notice);
            }
        } else {
            card.querySelectorAll('.add-btn, .search-result-add, .shared-add-detail')
                .forEach(addButton => {
                    addButton.disabled = false;
                    addButton.removeAttribute('aria-disabled');
                    addButton.removeAttribute('title');
                });
            card.querySelector('.admin-unavailable-label')?.remove();
        }
    }

    function installCatalogControls() {
        const grid = document.querySelector('.food-grid, .search-results-grid');
        if (!grid || !grid.parentElement || grid.parentElement.querySelector('.biterush-catalog-tools')) return;

        const tools = document.createElement('div');
        tools.className = 'biterush-catalog-tools';
        const makeSelect = (id, label, choices) => {
            const wrapper = document.createElement('label');
            wrapper.htmlFor = id;
            wrapper.textContent = label;
            const select = document.createElement('select');
            select.id = id;
            select.setAttribute('aria-label', label);
            choices.forEach(([value, text]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = text;
                select.appendChild(option);
            });
            wrapper.appendChild(select);
            tools.appendChild(wrapper);
            return select;
        };
        const sort = makeSelect('biterushSort', 'Sort dishes', [
            ['recommended', 'Recommended'],
            ['name', 'Name: A to Z'],
            ['price-low', 'Price: low to high'],
            ['price-high', 'Price: high to low']
        ]);
        const availability = makeSelect('biterushAvailability', 'Filter availability', [
            ['all', 'All dishes'],
            ['available', 'Available only'],
            ['unavailable', 'Unavailable only']
        ]);
        grid.parentElement.insertBefore(tools, grid);
        const cards = [...grid.children].filter(card =>
            card.matches('.food-card, .search-result-card')
        );
        const update = () => {
            const ordered = [...cards];
            if (sort.value === 'name') {
                ordered.sort((first, second) =>
                    (first.querySelector('.food-title, h3')?.textContent.trim() || '')
                        .localeCompare(second.querySelector('.food-title, h3')?.textContent.trim() || '')
                );
            } else if (sort.value === 'price-low' || sort.value === 'price-high') {
                const direction = sort.value === 'price-low' ? 1 : -1;
                ordered.sort((first, second) => {
                    const readPrice = card => Number(
                        card.querySelector('.price, .search-result-price')?.textContent.replace(/[^\d.]/g, '')
                        || card.dataset.price || 0
                    );
                    return (readPrice(first) - readPrice(second)) * direction;
                });
            }
            ordered.forEach(card => {
                grid.appendChild(card);
                const unavailable = Boolean(card.querySelector('.admin-unavailable-label'))
                    || Boolean(card.querySelector('.add-btn:disabled, .search-result-add:disabled'));
                card.hidden = (availability.value === 'available' && unavailable)
                    || (availability.value === 'unavailable' && !unavailable);
            });
        };
        sort.addEventListener('change', update);
        availability.addEventListener('change', update);
        window.addEventListener('biterush-menu-updated', update);
        update();
    }

    if (isProjectRootPage) {
        const customProducts = readObject(CUSTOM_PRODUCTS_KEY, []);
        const foodGrid = document.querySelector('.food-grid');
        if (Array.isArray(customProducts) && foodGrid) {
            customProducts.forEach(product => {
            if (!product || product.deleted === true || !product.title || !Number.isFinite(Number(product.price))) return;
                const card = document.createElement('div');
                card.className = 'food-card';
                card.dataset.productId = product.id || '';
                card.dataset.title = product.title;
                card.dataset.price = String(product.price);
                card.dataset.img = product.image || '';
                const image = document.createElement('img');
                image.className = 'food-img';
                image.src = product.image || '../BiteRushHomePage/HomePagePics/burger.png';
                image.alt = product.title;
                const info = document.createElement('div');
                info.className = 'food-info';
                const title = document.createElement('h2');
                title.className = 'food-title';
                title.textContent = product.title;
                const category = document.createElement('span');
                category.className = 'food-category';
                category.textContent = product.category || 'Featured dish';
                const description = document.createElement('p');
                description.className = 'food-description';
                description.textContent = product.description || '';
                const price = document.createElement('span');
                price.className = 'price';
                price.textContent = money(product.price);
                const addButton = document.createElement('button');
                addButton.type = 'button';
                addButton.className = 'add-btn';
                addButton.dataset.title = product.title;
                addButton.dataset.price = String(product.price);
                addButton.dataset.img = product.image || '';
                addButton.textContent = 'Add to cart';
                info.append(title, category, description, price, addButton);
                card.append(image, info);
                foodGrid.appendChild(card);
            });
        }
    }
    applyProductSettings();

    const overlay = document.createElement('div');
    overlay.className = 'shared-cart-overlay';
    const drawer = document.createElement('aside');
    drawer.className = 'shared-cart-drawer';
    drawer.innerHTML = `
        <div class="shared-cart-header">
            <h2>Your Order</h2>
            <button class="shared-cart-close" type="button" aria-label="Close cart">&times;</button>
        </div>
        <div class="shared-cart-items"></div>
        <div class="shared-cart-footer">
            <div class="shared-cart-total"><span>Total:</span><span class="shared-cart-total-value"></span></div>
            <a class="shared-cart-checkout" href="${checkoutPath}">Review payment and address</a>
            <a class="shared-cart-terms" href="${new URL('terms.html', new URL(checkoutPath, location.href)).href}">Terms and privacy</a>
        </div>`;
    document.body.append(overlay, drawer);

    const itemsElement = drawer.querySelector('.shared-cart-items');
    const totalElement = drawer.querySelector('.shared-cart-total-value');
    const render = () => {
        const count = cart.reduce((sum, item) => sum + item.quantity, 0);
        badge.textContent = count;
        button.setAttribute('aria-label', `Shopping Cart, ${count} item${count === 1 ? '' : 's'}`);
        itemsElement.replaceChildren();
        if (!cart.length) {
            const empty = document.createElement('div');
            empty.className = 'shared-cart-empty';
            empty.textContent = 'Your cart is empty.';
            itemsElement.appendChild(empty);
        } else {
            cart.forEach(item => {
                const row = document.createElement('div');
                row.className = 'shared-cart-item';
                const image = document.createElement('img');
                image.src = item.img;
                image.alt = item.title;
                const info = document.createElement('div');
                const title = document.createElement('h3');
                title.textContent = item.title;
                const price = document.createElement('p');
                price.textContent = `${money(item.price)} each`;
                info.append(title, price);
                if (item.instructions) {
                    const notes = document.createElement('p');
                    notes.className = 'shared-cart-item-notes';
                    notes.textContent = `Notes: ${item.instructions}`;
                    info.appendChild(notes);
                }
                const quantity = document.createElement('div');
                quantity.className = 'shared-cart-quantity';
                const decrease = document.createElement('button');
                decrease.type = 'button';
                decrease.dataset.title = itemKey(item);
                decrease.dataset.change = '-1';
                decrease.setAttribute('aria-label', `Remove one ${item.title}`);
                decrease.textContent = '−';
                const count = document.createElement('span');
                count.textContent = item.quantity;
                const increase = document.createElement('button');
                increase.type = 'button';
                increase.dataset.title = itemKey(item);
                increase.dataset.change = '1';
                increase.setAttribute('aria-label', `Add one ${item.title}`);
                increase.textContent = '+';
                quantity.append(decrease, count, increase);
                row.append(image, info, quantity);
                itemsElement.appendChild(row);
            });
        }
        totalElement.textContent = money(cart.reduce((sum, item) => sum + item.price * item.quantity, 0));
    };
    window.addEventListener('storage', event => {
        if (event.key === CART_KEY) {
            cart = readCart();
            render();
        }
    });
    const toggle = () => {
        drawer.classList.toggle('open');
        overlay.classList.toggle('open');
    };
    button.addEventListener('click', toggle);
    overlay.addEventListener('click', toggle);
    drawer.querySelector('.shared-cart-close').addEventListener('click', toggle);
    drawer.addEventListener('click', event => {
        const control = event.target.closest('[data-title]');
        if (control) change(control.dataset.title, Number(control.dataset.change));
    });

    document.querySelectorAll('.add-btn').forEach(addButton => {
        addButton.addEventListener('click', event => {
            const card = event.currentTarget.closest('.food-card, .search-result-card');
            if (!card) return;
            const image = card.querySelector('.food-img');
            const source = event.currentTarget.dataset;
            const detailLink = source.link || card.dataset.link || card.querySelector('.buy-btn')?.closest('a')?.getAttribute('href');
            add({
                title: source.title || card.dataset.title || card.querySelector('.food-title')?.textContent.trim(),
                price: Number(source.price || card.dataset.price || card.querySelector('.price')?.textContent.replace(/[^\d.]/g, '')),
                img: source.img || card.dataset.img || image?.getAttribute('src'),
                link: detailLink ? new URL(detailLink, location.href).pathname : ''
            });
        });
    });

    const detailCard = document.querySelector('.item-card');
    if (detailCard) {
        const detailImage = detailCard.querySelector('.item-img');
        const notes = document.createElement('textarea');
        notes.className = 'dish-special-instructions';
        notes.id = 'dishSpecialInstructions';
        notes.maxLength = 160;
        notes.rows = 2;
        notes.placeholder = 'Optional: special preparation instructions';
        notes.setAttribute('aria-label', 'Optional special preparation instructions');
        detailCard.querySelector('.item-quantity-price')?.before(notes);
        const detailItem = () => ({
            key: `${location.pathname}|${notes.value.trim()}`,
            title: detailCard.querySelector('.item-title')?.textContent.trim(),
            reviewTitle: detailCard.querySelector('.item-subtitle')?.textContent.trim()
                || detailCard.querySelector('.item-title')?.textContent.trim(),
            price: Number(detailCard.querySelector('.item-price')?.textContent.replace(/[^\d.]/g, '')),
            img: detailImage?.getAttribute('src'),
            link: location.pathname,
            instructions: notes.value.trim()
        });
        const detailKey = location.pathname;
        const existingDetailItem = cart.find(item =>
            item.key === detailKey || item.key.startsWith(`${detailKey}|`)
        );
        const currentDetailPrice = Number(
            detailCard.querySelector('.item-price')?.textContent.replace(/[^\d.]/g, '')
        );
        if (existingDetailItem && Number.isFinite(currentDetailPrice)
            && existingDetailItem.price !== currentDetailPrice) {
            existingDetailItem.price = currentDetailPrice;
            saveCart();
        }
        const getDetailQuantity = () => cart
            .filter(item => item.key === detailKey || item.key.startsWith(`${detailKey}|`))
            .reduce((sum, item) => sum + item.quantity, 0);
        const detailQuantity = detailCard.querySelector('.qty-count');
        const updateDetailQuantity = () => {
            if (detailQuantity) detailQuantity.textContent = getDetailQuantity() || 1;
        };
        if (!detailCard.querySelector('.shared-add-detail')) {
            const detailAddButton = document.createElement('button');
            detailAddButton.className = 'shared-add-detail';
            detailAddButton.type = 'button';
            detailAddButton.textContent = 'Add to cart';
            detailCard.querySelector('.item-quantity-price')?.appendChild(detailAddButton);
            applyProductSetting(detailCard, detailCard.querySelector('.item-title')?.textContent.trim());
            detailAddButton.addEventListener('click', () => {
                add(detailItem());
                drawer.classList.add('open');
                overlay.classList.add('open');
                updateDetailQuantity();
            });
            detailCard.querySelectorAll('.qty-btn').forEach((control, index) => {
                control.addEventListener('click', () => {
                    if (index === 1) add(detailItem());
                    else {
                        const item = cart.find(entry =>
                            entry.key === `${detailKey}|${notes.value.trim()}`
                        );
                        if (item) change(itemKey(item), -1);
                    }
                    updateDetailQuantity();
                });
            });
        }
        document.querySelectorAll('.checkout-btn').forEach(checkoutButton => {
            checkoutButton.addEventListener('click', () => {
                if (!getDetailQuantity()) add(detailItem());
                location.href = checkoutPath;
            });
        });
        updateDetailQuantity();
    }

    window.BiteRushCart = { add, change, get items() { return [...cart]; } };
    installCatalogControls();
    window.addEventListener('storage', event => {
        if (isProjectRootPage && event.key === CUSTOM_PRODUCTS_KEY) {
            location.reload();
            return;
        }
        if (event.key === PRODUCT_OVERRIDES_KEY) {
            productOverrides = readObject(PRODUCT_OVERRIDES_KEY, {});
            applyProductSettings();
            window.dispatchEvent(new Event('biterush-menu-updated'));
            cart = readCart();
            render();
        }
    });
    render();
}());
