(function () {
    const key = 'biterush_cart';
    const voucherKey = 'biterush_voucher';
    const vouchers = {
        voucher20: { rate: 0.20, cap: 500, minimum: 249 },
        voucher15: { rate: 0.15, cap: 600, minimum: 199 }
    };
    const read = () => {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(value)
                ? value.filter(item => item && item.title && Number.isFinite(Number(item.price)) && item.img)
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
        const currentPrice = Number(
            itemCard?.querySelector('.item-price')?.textContent.replace(/[^\d.]/g, '')
        );
        const current = storedCart.find(item => item.title === currentTitle);
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
        setText('.header-amount', money(subtotal));
        setText('.total-amount', money(total));
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
            summary.innerHTML = cart.length
                ? cart.map(item => `<strong>${item.quantity}x ${item.title}</strong>`).join('<br>')
                : '<strong>Your cart is empty.</strong>';
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
            orderButton.addEventListener('click', () => {
                localStorage.removeItem(key);
                localStorage.removeItem(voucherKey);
                localStorage.removeItem('biterush_delivery');
            }, { once: true });
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
