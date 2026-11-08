    (function () {
        const key = 'biterush_cart';
        const voucherKey = 'biterush_voucher';
        const deliveryKey = 'biterush_delivery';
        const receiptKey = 'biterush_last_order';
        const ordersKey = 'biterush_orders';
        const overridesKey = 'biterush_product_overrides';
        const customProductsKey = 'biterush_custom_products';
        const vouchers = {
            voucher20: { rate: 0.20, cap: 500, minimum: 249 },
            voucher15: { rate: 0.15, cap: 600, minimum: 199 }
        };
        const read = () => {
            try {
                const value = JSON.parse(localStorage.getItem(key) || '[]');
                const overrides = JSON.parse(localStorage.getItem(overridesKey) || '{}');
                return Array.isArray(value)
                    ? value
                        .filter(item => item && item.title && item.img)
                        .map(item => ({
                            ...item,
                            price: Number.isFinite(Number(overrides[item.title.trim().toLocaleLowerCase()]?.price))
                                ? Number(overrides[item.title.trim().toLocaleLowerCase()].price)
                                : Number(item.price),
                            quantity: Number(item.quantity)
                        }))
                        .filter(item => Number.isFinite(item.price) && item.price >= 0
                            && Number.isSafeInteger(item.quantity) && item.quantity > 0)
                    : [];
            } catch (error) {
                console.error('Unable to read checkout cart:', error);
                return [];
            }
        };
        const money = value => `₱ ${Number(value).toFixed(2)}`;
        const setText = (selector, value) => {
            document.querySelectorAll(selector).forEach(element => {
                element.textContent = value;
            });
        };
        const update = () => {
            const storedCart = read();
            const itemCard = document.querySelector('.item-card');
            const currentTitle = itemCard?.querySelector('.item-title')?.textContent.trim();
            const reviewTitle = itemCard?.querySelector('.item-subtitle')?.textContent.trim()
                || currentTitle;
            const currentPrice = Number(
                itemCard?.querySelector('.item-price')?.textContent.replace(/[^\d.]/g, '')
            );
            const itemDetails = itemCard?.querySelector('.item-details');
            if (itemDetails && currentTitle) {
                let reviewsLink = itemDetails.querySelector('.product-reviews-link');
                if (!reviewsLink) {
                    reviewsLink = document.createElement('a');
                    reviewsLink.className = 'product-reviews-link';
                    const foodName = document.createElement('span');
                    foodName.className = 'product-reviews-name';
                    const label = document.createElement('span');
                    label.textContent = 'Ratings';
                    reviewsLink.append(foodName, label);
                    itemDetails.appendChild(reviewsLink);
                }
                const reviewsUrl = new URL('../../../Feedback/index.html', window.location.href);
                reviewsUrl.searchParams.set('food', reviewTitle);
                reviewsUrl.searchParams.set('path', window.location.pathname);
                reviewsLink.href = reviewsUrl.href;
                reviewsLink.querySelector('.product-reviews-name').textContent = currentTitle;
                reviewsLink.setAttribute('aria-label', `See ratings and reviews for ${currentTitle}`);
                reviewsLink.title = `Ratings for ${currentTitle}`;
            }
            const current = storedCart.find(item => item.key === window.location.pathname
                || item.link === window.location.pathname);
            const cart = storedCart.length || !itemCard || !Number.isFinite(currentPrice)
                ? storedCart
                : [{
                    title: currentTitle,
                    price: currentPrice,
                    quantity: 1
                }];
            const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
            const selectedVoucher = vouchers[localStorage.getItem(voucherKey)];
            const discount = selectedVoucher && subtotal >= selectedVoucher.minimum
                ? Math.min(subtotal * selectedVoucher.rate, selectedVoucher.cap)
                : 0;
            const delivery = subtotal ? 4 : 0;
            const service = subtotal ? 9 : 0;
            const total = Math.max(0, subtotal - discount + delivery + service);
            if (document.querySelector('.checkout-container')) {
            if (current) {
                const quantity = itemCard.querySelector('.qty-count');
                if (quantity) quantity.textContent = current.quantity;
            }
            const summaryCard = document.querySelector('.summary-card');
            if (summaryCard) {
                let cartLines = summaryCard.querySelector('.checkout-cart-lines');
                if (!cartLines) {
                    cartLines = document.createElement('div');
                    cartLines.className = 'checkout-cart-lines';
                    summaryCard.querySelector('.summary-header')?.after(cartLines);
                }
                cartLines.replaceChildren();
                if (cart.length) {
                    cart.forEach(item => {
                        const row = document.createElement('div');
                        row.className = 'fee-row checkout-cart-line';
                        const info = document.createElement('div');
                        info.className = 'fee-info';
                        const title = document.createElement('span');
                        title.className = 'fee-title';
                        title.textContent = `${item.quantity} × ${item.title}`;
                        const unitPrice = document.createElement('span');
                        unitPrice.className = 'fee-subtext';
                        unitPrice.textContent = `${money(item.price)} each`;
                        const lineTotal = document.createElement('span');
                        lineTotal.className = 'fee-amount';
                        lineTotal.textContent = money(item.price * item.quantity);
                        info.append(title, unitPrice);
                        if (item.instructions) {
                            const itemNotes = document.createElement('span');
                            itemNotes.className = 'fee-subtext checkout-item-notes';
                            itemNotes.textContent = `Notes: ${item.instructions}`;
                            info.appendChild(itemNotes);
                        }
                        row.append(info, lineTotal);
                        cartLines.appendChild(row);
                    });
                } else {
                    const empty = document.createElement('p');
                    empty.className = 'checkout-cart-empty';
                    empty.textContent = 'Your cart is empty.';
                    cartLines.appendChild(empty);
                }
            }
            setText('.header-amount', money(subtotal));
            setText('.total-amount', money(total));
            const deliveryRows = [...document.querySelectorAll('.summary-card .fee-row')].filter(row => {
                const title = row.querySelector('.fee-title')?.textContent.trim().toLowerCase();
                return title === 'standard delivery' || title === 'delivery fee';
            });
            deliveryRows.slice(0, -1).forEach(row => {
                row.hidden = true;
            });
            const feeAmounts = document.querySelectorAll('.summary-card .fee-amount');
            feeAmounts.forEach(amount => {
                const title = amount.closest('.fee-row')?.querySelector('.fee-title')?.textContent.trim().toLowerCase();
                if (title === 'standard delivery' || title === 'delivery fee') amount.textContent = money(delivery);
                if (title === 'service fee') amount.textContent = money(service);
            });
            const discountElement = document.querySelector('.voucher-discount-amount');
            if (discountElement) {
                discountElement.textContent = `-${money(discount)}`;
                discountElement.closest('.voucher-discount-row').hidden = discount === 0;
            }
            }
            if (document.querySelector('.page')) {
            const summary = document.querySelector('.page .summary-item');
            if (summary) {
                summary.replaceChildren();
                if (cart.length) {
                    cart.forEach(item => {
                        const row = document.createElement('div');
                        row.className = 'cart-summary-line';
                        const label = document.createElement('span');
                        label.textContent = `${item.quantity} × ${item.title} (${money(item.price)} each)`;
                        const copy = document.createElement('div');
                        copy.className = 'cart-summary-copy';
                        copy.appendChild(label);
                        if (item.instructions) {
                            const notes = document.createElement('small');
                            notes.className = 'checkout-item-notes';
                            notes.textContent = `Preparation notes: ${item.instructions}`;
                            copy.appendChild(notes);
                        }
                        const lineTotal = document.createElement('strong');
                        lineTotal.textContent = money(item.price * item.quantity);
                        row.append(copy, lineTotal);
                        summary.appendChild(row);
                    });
                } else {
                    const empty = document.createElement('strong');
                    empty.textContent = 'Your cart is empty.';
                    summary.appendChild(empty);
                }
            }
            const discountLine = document.querySelector('.page .voucher-discount-line');
            if (discountLine) {
                discountLine.hidden = discount === 0;
                discountLine.querySelector('span:last-child').textContent = `-${money(discount)}`;
            }
            const lines = document.querySelectorAll('.page .summary-line:not(.voucher-discount-line) span:last-child');
            if (lines.length >= 3) {
                lines[0].textContent = money(subtotal);
                lines[1].textContent = money(delivery);
                lines[2].textContent = money(service);
            }
            const finalTotal = document.querySelector('.page .total-price');
            if (finalTotal) finalTotal.textContent = money(total);
            const payment = document.querySelector('.page .payment-row > span:last-child');
            if (payment) payment.textContent = money(total);
            const orderButton = document.querySelector('.page .order-button');
            if (orderButton) {
                orderButton.disabled = cart.length === 0;
                if (!orderButton.dataset.orderHandlerAttached) {
                    orderButton.dataset.orderHandlerAttached = 'true';
                    orderButton.addEventListener('click', event => {
                        event.preventDefault();
                        const orderedCart = read();
                        if (!orderedCart.length) return;
                        let overrides = {};
                        try {
                            overrides = JSON.parse(localStorage.getItem(overridesKey) || '{}');
                        } catch (error) {
                            console.error('Unable to read product availability:', error);
                            window.alert('We could not verify menu availability. Please reload checkout and try again.');
                            return;
                        }
                        const unavailable = orderedCart.find(item => {
                            const override = overrides[item.title.trim().toLocaleLowerCase()];
                            return override?.available === false || override?.deleted === true;
                        });
                        if (unavailable) {
                            window.alert(`${unavailable.title} is currently unavailable. Please remove it from your cart before ordering.`);
                            return;
                        }

                        let deliveryState = {};
                        try {
                            const savedState = JSON.parse(localStorage.getItem(deliveryKey) || '{}');
                            if (savedState && typeof savedState === 'object') {
                                deliveryState = savedState;
                            }
                        } catch (error) {
                            console.error('Unable to read delivery preferences for order receipt:', error);
                        }

                        const subtotal = orderedCart.reduce(
                            (sum, item) => sum + item.price * item.quantity,
                            0
                        );
                        const voucher = vouchers[localStorage.getItem(voucherKey)];
                        const discount = voucher && subtotal >= voucher.minimum
                            ? Math.min(subtotal * voucher.rate, voucher.cap)
                            : 0;
                        const deliveryFee = subtotal
                            ? Math.max(0, 4 + (Number(deliveryState.adjustment) || 0))
                            : 0;
                        const serviceFee = subtotal ? 9 : 0;
                        const tip = Math.max(0, Number(deliveryState.tip) || 0);
                        const total = Math.max(0, subtotal - discount + deliveryFee + serviceFee + tip);
                        const deliveryLabel = deliveryState.label || 'Standard';
                        const addressInput = document.getElementById('deliveryAddress');
                        const address = addressInput?.value.replace(/\s+/g, ' ').trim() || '';
                        if (address.length < 8) {
                            addressInput?.setCustomValidity('Enter a complete delivery address (at least 8 characters).');
                            addressInput?.reportValidity();
                            addressInput?.focus();
                            return;
                        }
                        addressInput?.setCustomValidity('');
                        const instructions = document.getElementById('deliveryInstructions')?.value.trim() || '';
                        const etaByDelivery = {
                            Priority: '15–30 minutes',
                            Standard: '20–45 minutes',
                            Saver: '30–45 minutes',
                            Schedule: 'As scheduled'
                        };
                        const etaMinutesByDelivery = {
                            Priority: 23,
                            Standard: 33,
                            Saver: 38
                        };
                        const etaMinutes = etaMinutesByDelivery[deliveryLabel];
                        const etaAt = etaMinutes
                            ? new Date(Date.now() + etaMinutes * 60 * 1000).toISOString()
                            : null;
                        const customProducts = JSON.parse(localStorage.getItem(customProductsKey) || '[]');
                        const stockProducts = Array.isArray(customProducts) ? customProducts : [];
                        const normalizeTitle = title => String(title || '').trim().toLocaleLowerCase();
                        const stockFor = item => {
                            const override = overrides[normalizeTitle(item.title)];
                            if (override && override.stock !== undefined && override.stock !== null && override.stock !== ''
                                && Number.isFinite(Number(override.stock))) {
                                return Math.max(0, Number(override.stock));
                            }
                            const customProduct = stockProducts.find(product =>
                                product && normalizeTitle(product.title) === normalizeTitle(item.title)
                            );
                            return customProduct && customProduct.stock !== undefined && customProduct.stock !== null
                                && customProduct.stock !== '' && Number.isFinite(Number(customProduct.stock))
                                ? Math.max(0, Number(customProduct.stock))
                                : null;
                        };
                        for (const item of orderedCart) {
                            const stock = stockFor(item);
                            if (stock !== null && Number(item.quantity) > stock) {
                                window.alert(`${item.title} has insufficient stock. Only ${stock} remaining.`);
                                return;
                            }
                        }
                        const receipt = {
                            id: `BR-${Date.now().toString(36).toUpperCase()}`,
                            createdAt: new Date().toISOString(),
                            status: 'received',
                            items: orderedCart.map(item => ({
                                title: item.title,
                                reviewTitle: item.reviewTitle || item.title,
                                price: item.price,
                                quantity: item.quantity,
                                instructions: item.instructions || '',
                                img: item.img,
                                link: item.link || '',
                                key: item.key || ''
                            })),
                            subtotal,
                            discount,
                            deliveryFee,
                            serviceFee,
                            tip,
                            total,
                            deliveryLabel,
                            eta: etaByDelivery[deliveryLabel] || '20–45 minutes',
                            etaAt,
                            address,
                            instructions,
                            payment: deliveryState.payment || 'Cash'
                        };

                        let previousStorage = {};
                        try {
                            previousStorage = Object.fromEntries(
                                [ordersKey, receiptKey, key, voucherKey, deliveryKey, overridesKey, customProductsKey]
                                    .map(storageKey => [storageKey, localStorage.getItem(storageKey)])
                            );
                            orderedCart.forEach(item => {
                                const titleKey = normalizeTitle(item.title);
                                const stock = stockFor(item);
                                if (stock === null) return;
                                const remaining = Math.max(0, stock - Number(item.quantity));
                                overrides[titleKey] = {
                                    ...(overrides[titleKey] || {}),
                                    stock: remaining
                                };
                                const customIndex = stockProducts.findIndex(product =>
                                    product && normalizeTitle(product.title) === titleKey
                                );
                                if (customIndex !== -1) {
                                    stockProducts[customIndex] = {
                                        ...stockProducts[customIndex],
                                        stock: remaining
                                    };
                                }
                            });
                            localStorage.setItem(overridesKey, JSON.stringify(overrides));
                            localStorage.setItem(customProductsKey, JSON.stringify(stockProducts));
                            const orderHistory = JSON.parse(localStorage.getItem(ordersKey) || '[]');
                            if (!Array.isArray(orderHistory)) {
                                throw new Error('Saved order history is not a valid list.');
                            }
                            const updatedHistory = [
                                receipt,
                                ...orderHistory.filter(order => order && order.id !== receipt.id)
                            ];
                            localStorage.setItem(ordersKey, JSON.stringify(updatedHistory));
                            localStorage.setItem(receiptKey, JSON.stringify(receipt));
                            localStorage.removeItem(key);
                            localStorage.removeItem(voucherKey);
                            localStorage.removeItem(deliveryKey);
                        } catch (error) {
                            console.error('Unable to save completed order:', error);
                            Object.entries(previousStorage).forEach(([storageKey, previousValue]) => {
                                try {
                                    if (previousValue === null) localStorage.removeItem(storageKey);
                                    else localStorage.setItem(storageKey, previousValue);
                                } catch (restoreError) {
                                    console.error(`Unable to restore ${storageKey} after order save failed:`, restoreError);
                                }
                            });
                            window.alert('We could not save your order confirmation. Please try again.');
                            return;
                        }

                        window.location.href = orderButton.dataset.confirmationHref
                            || '../GobackHome/loading.html';
                    });
                }
            }
            }
        }
        const voucherInputs = document.querySelectorAll('input[name="voucher"]');
        voucherInputs.forEach((input, index) => {
            const voucherId = index === 0 ? 'voucher20' : 'voucher15';
            input.value = voucherId;
            input.checked = localStorage.getItem(voucherKey) === voucherId;
            input.addEventListener('change', () => {
                localStorage.setItem(voucherKey, input.checked ? voucherId : '');
                update();
            });
        });
        const summaryCard = document.querySelector('.summary-card');
        if (summaryCard && !summaryCard.querySelector('.voucher-discount-row')) {
            const row = document.createElement('div');
            row.className = 'fee-row voucher-discount-row';
            row.innerHTML = '<div class="fee-info"><span class="fee-title">Voucher discount</span></div><span class="fee-amount voucher-discount-amount"></span>';
            row.hidden = true;
            summaryCard.querySelector('.voucher-section-title')?.before(row);
        }
        const deliverySummary = document.querySelector('.page .summary-line:last-of-type');
        if (deliverySummary && !document.querySelector('.page .voucher-discount-line')) {
            const row = document.createElement('div');
            row.className = 'summary-line voucher-discount-line';
            row.innerHTML = '<span>Voucher discount</span><span></span>';
            deliverySummary.after(row);
        }
        window.addEventListener('biterush-cart-updated', update);
        window.addEventListener('storage', update);
        update();
    }());
