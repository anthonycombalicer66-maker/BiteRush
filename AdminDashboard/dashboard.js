'use strict';

(function () {
    const sessionKey = 'biterushAdminLoggedIn';
    const receiptKey = 'biterush_last_order';
    const ordersKey = 'biterush_orders';
    const overridesKey = 'biterush_product_overrides';
    const customProductsKey = 'biterush_custom_products';
    const auditKey = 'biterush_audit_log';
    const adminIdentityKey = 'biterushAdminIdentity';
    const stageLabels = {
        received: 'Order received',
        preparing: 'Preparing',
        on_the_way: 'On the way',
        delivered: 'Delivered',
        cancelled: 'Cancelled'
    };
    const dashboard = document.getElementById('dashboardView');

    if (localStorage.getItem(sessionKey) !== 'true') {
        window.location.replace('login.html');
        return;
    }

    dashboard.hidden = false;
    let identity = { role: 'Administrator', name: 'Administrator' };
    try {
        identity = JSON.parse(localStorage.getItem(adminIdentityKey) || 'null') || identity;
    } catch (error) {
        console.error('Unable to read administrator identity:', error);
    }
    const identityDisplay = document.getElementById('sessionRole');
    if (identityDisplay) identityDisplay.textContent = identity.role || 'Administrator';
    if (String(identity.role || '').toLocaleLowerCase() !== 'admin') {
        document.querySelectorAll('[data-admin-only]').forEach(section => {
            section.hidden = true;
        });
    }
    const storageWarning = document.getElementById('storageWarning');
    const warnStorage = message => {
        storageWarning.textContent = message;
        storageWarning.hidden = false;
    };

    const readJSON = (key, fallback) => {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value === null ? fallback : value;
        } catch (error) {
            console.error(`Unable to read ${key}:`, error);
            warnStorage(`Dashboard data for "${key}" could not be read.`);
            return fallback;
        }
    };
    const getAuditEntries = () => {
        const entries = readJSON(auditKey, []);
        return Array.isArray(entries) ? entries : [];
    };
    const addAuditEntry = (action, entity, details = '') => {
        const entries = getAuditEntries();
        entries.unshift({
            id: window.crypto?.randomUUID
                ? window.crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            at: new Date().toISOString(),
            actor: identity.name || identity.username || 'Administrator',
            role: identity.role || 'Administrator',
            action,
            entity,
            details
        });
        try {
            localStorage.setItem(auditKey, JSON.stringify(entries.slice(0, 500)));
            renderAuditLog();
        } catch (error) {
            console.error('Unable to save audit log:', error);
        }
    };
    const money = value => `₱${(Number(value) || 0).toFixed(2)}`;
    const normalizeTitle = title => String(title || '').trim().toLocaleLowerCase();
    const getOrders = () => {
        const stored = readJSON(ordersKey, []);
        if (!Array.isArray(stored)) {
            warnStorage('Saved order history is not a valid list.');
        }
        const orders = Array.isArray(stored)
            ? stored.filter(order => order && typeof order.id === 'string')
            : [];
        const latest = readJSON(receiptKey, null);
        if (latest && typeof latest.id === 'string' && Array.isArray(latest.items)) {
            const latestIndex = orders.findIndex(order => order.id === latest.id);
            if (latestIndex === -1) {
                orders.unshift(latest);
            } else {
                orders[latestIndex] = { ...orders[latestIndex], ...latest };
            }
        }
        return orders.sort((first, second) =>
            new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime()
        );
    };
    let selectedOrderId = null;
    let selectedOrderIds = new Set();
    let ordersPage = 1;
    let orders = getOrders();
    const knownOrderIds = new Set(orders.map(order => order.id));
    const ordersList = document.getElementById('ordersList');
    const orderDetail = document.getElementById('orderDetail');
    const filterInput = document.getElementById('orderFilter');
    const searchInput = document.getElementById('orderSearch');

    function renderMetrics() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todaysOrders = orders.filter(order => {
            const date = new Date(order.createdAt);
            return !Number.isNaN(date.getTime()) && date >= today;
        });
        const activeCount = orders.filter(order =>
            order.status !== 'delivered' && order.status !== 'cancelled'
        ).length;
        const feedback = orders.map(order => order.feedback).filter(Boolean);
        const ratings = feedback.flatMap(review => [Number(review.foodRating), Number(review.deliveryRating)])
            .filter(rating => Number.isFinite(rating) && rating >= 1 && rating <= 5);
        document.getElementById('metricOrders').textContent = String(todaysOrders.length);
        document.getElementById('metricSales').textContent =
            money(todaysOrders.filter(order => order.status !== 'cancelled')
                .reduce((sum, order) => sum + Math.max(0, (Number(order.total) || 0) - (Number(order.refundAmount) || 0)), 0));
        document.getElementById('metricPending').textContent = String(activeCount);
        document.getElementById('metricRating').textContent = ratings.length
            ? `${(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)} / 5`
            : '—';
    }

    function renderSalesCharts(included, start, end) {
        const revenueContainer = document.getElementById('revenueChart');
        const ordersContainer = document.getElementById('ordersChart');
        revenueContainer.replaceChildren();
        ordersContainer.replaceChildren();

        const startInput = document.getElementById('reportStart').value;
        const endInput = document.getElementById('reportEnd').value;
        const orderDates = included
            .map(order => new Date(order.createdAt || 0))
            .filter(date => !Number.isNaN(date.getTime()));
        const earliestOrder = orderDates.length
            ? orderDates.reduce((earliest, date) => date < earliest ? date : earliest)
            : null;
        const latestOrder = orderDates.length
            ? orderDates.reduce((latest, date) => date > latest ? date : latest)
            : null;
        const dateOnly = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const addDays = (date, days) => {
            const result = new Date(date);
            result.setDate(result.getDate() + days);
            return result;
        };
        const rangeStart = start || (earliestOrder ? dateOnly(earliestOrder) : addDays(end || new Date(), -30));
        const rangeEnd = end || (latestOrder ? dateOnly(latestOrder) : new Date());
        const firstDay = dateOnly(rangeStart);
        const lastDay = dateOnly(rangeEnd);
        const exclusiveEnd = addDays(lastDay, 1);
        const dayCount = Math.max(1, Math.round((lastDay - firstDay) / 86400000) + 1);
        const monthCount = (lastDay.getFullYear() - firstDay.getFullYear()) * 12
            + lastDay.getMonth() - firstDay.getMonth() + 1;
        const spansYears = firstDay.getFullYear() !== lastDay.getFullYear();
        const periods = [];
        const addPeriod = (periodStart, periodEnd, label) => {
            periods.push({ start: periodStart, end: periodEnd, label, revenue: 0, orders: 0 });
        };

        if (dayCount <= 14) {
            for (let index = 0; index < dayCount; index += 1) {
                const periodStart = addDays(firstDay, index);
                addPeriod(periodStart, addDays(periodStart, 1), periodStart.toLocaleDateString('en', {
                    month: 'short',
                    day: 'numeric'
                }));
            }
        } else if (dayCount <= 90) {
            for (let periodStart = firstDay; periodStart < exclusiveEnd;) {
                const periodEnd = new Date(Math.min(addDays(periodStart, 7).getTime(), exclusiveEnd.getTime()));
                const periodLastDay = addDays(periodEnd, -1);
                const label = `${periodStart.toLocaleDateString('en', { month: 'short', day: 'numeric' })}–${periodLastDay.toLocaleDateString('en', {
                    month: 'short',
                    day: 'numeric'
                })}`;
                addPeriod(periodStart, periodEnd, label);
                periodStart = periodEnd;
            }
        } else if (monthCount <= 12) {
            for (let monthStart = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1);
                monthStart < exclusiveEnd;) {
                const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
                const periodStart = new Date(Math.max(firstDay.getTime(), monthStart.getTime()));
                const periodEnd = new Date(Math.min(exclusiveEnd.getTime(), nextMonth.getTime()));
                const label = monthStart.toLocaleDateString('en', {
                    month: 'short',
                    ...(spansYears ? { year: '2-digit' } : {})
                });
                addPeriod(periodStart, periodEnd, label);
                monthStart = nextMonth;
            }
        } else if (monthCount <= 36) {
            for (let quarterStart = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1);
                quarterStart < exclusiveEnd;) {
                const quarterEnd = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 1);
                const periodStart = new Date(Math.max(firstDay.getTime(), quarterStart.getTime()));
                const periodEnd = new Date(Math.min(exclusiveEnd.getTime(), quarterEnd.getTime()));
                const finalMonth = new Date(periodEnd.getTime() - 1);
                const label = spansYears
                    ? `${quarterStart.toLocaleDateString('en', { month: 'short', year: '2-digit' })}–${finalMonth.toLocaleDateString('en', { month: 'short', year: '2-digit' })}`
                    : `${quarterStart.toLocaleDateString('en', { month: 'short' })}–${finalMonth.toLocaleDateString('en', { month: 'short' })}`;
                addPeriod(periodStart, periodEnd, label);
                quarterStart = quarterEnd;
            }
        } else {
            for (let index = 0; index < 12; index += 1) {
                const periodStart = addDays(firstDay, Math.floor(dayCount * index / 12));
                const periodEnd = addDays(firstDay, Math.floor(dayCount * (index + 1) / 12));
                addPeriod(periodStart, periodEnd, periodStart.toLocaleDateString('en', {
                    month: 'short',
                    year: '2-digit'
                }));
            }
        }

        included.forEach(order => {
            const createdAt = new Date(order.createdAt || 0);
            if (Number.isNaN(createdAt.getTime())) return;
            const period = periods.find(entry => createdAt >= entry.start && createdAt < entry.end);
            if (!period) return;
            period.orders += 1;
            period.revenue += Number(order.total) || 0;
        });

        const svgNamespace = 'http://www.w3.org/2000/svg';
        const createSvgElement = (name, attributes = {}) => {
            const element = document.createElementNS(svgNamespace, name);
            Object.entries(attributes).forEach(([attribute, value]) => {
                element.setAttribute(attribute, String(value));
            });
            return element;
        };
        const addText = (svg, text, attributes) => {
            const element = createSvgElement('text', attributes);
            element.textContent = text;
            svg.appendChild(element);
        };
        const chartWidth = 640;
        const chartHeight = 250;
        const plot = { left: 66, right: 626, top: 22, bottom: 195 };
        const chartCaption = (container, text) => {
            const caption = document.createElement('p');
            caption.className = 'report-chart-summary';
            caption.textContent = text;
            container.appendChild(caption);
        };
        const createChart = (container, title, description, values, formatter, type) => {
            const svg = createSvgElement('svg', {
                viewBox: `0 0 ${chartWidth} ${chartHeight}`,
                role: 'img',
                'aria-label': description
            });
            const svgTitle = createSvgElement('title');
            svgTitle.textContent = title;
            svg.appendChild(svgTitle);
            const svgDescription = createSvgElement('desc');
            svgDescription.textContent = description;
            svg.appendChild(svgDescription);
            const maximum = Math.max(...values, 1);
            const barSlot = (plot.right - plot.left) / Math.max(values.length, 1);
            const xFor = index => plot.left + barSlot * (index + .5);

            [0, 1 / 3, 2 / 3, 1].forEach(fraction => {
                const y = plot.bottom - (plot.bottom - plot.top) * fraction;
                svg.appendChild(createSvgElement('line', {
                    x1: plot.left,
                    x2: plot.right,
                    y1: y,
                    y2: y,
                    class: 'chart-grid-line'
                }));
                addText(svg, formatter(maximum * fraction), {
                    x: plot.left - 9,
                    y: y + 3,
                    'text-anchor': 'end',
                    class: 'chart-axis-label'
                });
            });

            const points = values.map((value, index) => ({
                x: xFor(index),
                y: plot.bottom - (plot.bottom - plot.top) * value / maximum,
                value
            }));
            if (type === 'line') {
                const linePath = points.map((point, index) =>
                    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
                ).join(' ');
                const areaPath = `${linePath} L ${points[points.length - 1].x} ${plot.bottom} L ${points[0].x} ${plot.bottom} Z`;
                svg.appendChild(createSvgElement('path', { d: areaPath, class: 'chart-area' }));
                svg.appendChild(createSvgElement('path', { d: linePath, class: 'chart-line' }));
            }
            points.forEach((point, index) => {
                const period = periods[index];
                const periodLabel = period.start.toLocaleDateString('en', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
                const periodEndLabel = addDays(period.end, -1).toLocaleDateString('en', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
                const details = `${period.label}: ${formatter(point.value)}${period.start.getTime() === addDays(period.end, -1).getTime()
                    ? ''
                    : ` (${periodLabel}–${periodEndLabel})`}`;
                if (type === 'bar') {
                    const barWidth = Math.max(5, Math.min(30, barSlot * .52));
                    const bar = createSvgElement('rect', {
                        x: point.x - barWidth / 2,
                        y: point.y,
                        width: barWidth,
                        height: Math.max(0, plot.bottom - point.y),
                        class: 'chart-bar'
                    });
                    const tooltip = createSvgElement('title');
                    tooltip.textContent = details;
                    bar.appendChild(tooltip);
                    svg.appendChild(bar);
                } else {
                    const circle = createSvgElement('circle', {
                        cx: point.x,
                        cy: point.y,
                        r: 4,
                        class: 'chart-point'
                    });
                    const tooltip = createSvgElement('title');
                    tooltip.textContent = details;
                    circle.appendChild(tooltip);
                    svg.appendChild(circle);
                }
                addText(svg, period.label, {
                    x: point.x,
                    y: plot.bottom + 20,
                    'text-anchor': 'middle',
                    class: 'chart-x-label'
                });
            });
            container.appendChild(svg);
        };

        const totalRevenue = periods.reduce((sum, period) => sum + period.revenue, 0);
        const totalOrders = periods.reduce((sum, period) => sum + period.orders, 0);
        const periodWord = periods.length === 1 ? 'period' : 'periods';
        createChart(
            revenueContainer,
            'Sales trend',
            `Sales revenue across ${periods.length} ${periodWord}; total ${money(totalRevenue)}.`,
            periods.map(period => period.revenue),
            value => value >= 1000000
                ? `₱${(value / 1000000).toFixed(1)}m`
                : value >= 1000 ? `₱${(value / 1000).toFixed(1)}k` : money(value),
            'line'
        );
        createChart(
            ordersContainer,
            'Orders by period',
            `${totalOrders} non-cancelled orders across ${periods.length} ${periodWord}.`,
            periods.map(period => period.orders),
            value => String(Math.round(value)),
            'bar'
        );
        chartCaption(
            revenueContainer,
            totalOrders
                ? `${money(totalRevenue)} sales across ${periods.length} ${periodWord}`
                : 'No sales in this date range.'
        );
        chartCaption(
            ordersContainer,
            `${totalOrders} order${totalOrders === 1 ? '' : 's'} across ${periods.length} ${periodWord}`
        );
    }

    function renderSalesReport() {
        const startValue = document.getElementById('reportStart').value;
        const endValue = document.getElementById('reportEnd').value;
        const start = startValue ? new Date(`${startValue}T00:00:00`) : null;
        const end = endValue ? new Date(`${endValue}T23:59:59.999`) : null;
        if (start && end && start > end) {
            document.getElementById('reportSummary').textContent = 'Choose a start date on or before the end date.';
            document.getElementById('popularDishes').replaceChildren();
            ['revenueChart', 'ordersChart'].forEach(id => {
                const message = document.createElement('p');
                message.className = 'chart-empty';
                message.textContent = 'Correct the date range to view this chart.';
                document.getElementById(id).replaceChildren(message);
            });
            return;
        }
        const included = orders.filter(order => {
            if (order.status === 'cancelled') return false;
            const date = new Date(order.createdAt || 0);
            return !Number.isNaN(date.getTime()) && (!start || date >= start) && (!end || date <= end);
        });
        const revenue = included.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
        renderSalesCharts(included, start, end);
        document.getElementById('reportSummary').textContent =
            `${included.length} completed or active order${included.length === 1 ? '' : 's'} · ${money(revenue)} gross order value${startValue || endValue ? ` · ${startValue || 'Any date'} to ${endValue || 'Today'}` : ''}`;
        const popular = new Map();
        included.forEach(order => (Array.isArray(order.items) ? order.items : []).forEach(item => {
            const name = String(item.title || 'Item');
            popular.set(name, (popular.get(name) || 0) + (Number(item.quantity) || 1));
        }));
        const list = document.getElementById('popularDishes');
        list.replaceChildren();
        [...popular.entries()].sort((first, second) => second[1] - first[1]).slice(0, 5)
            .forEach(([name, quantity]) => {
                const entry = document.createElement('li');
                entry.textContent = `${name} — ${quantity} sold`;
                list.appendChild(entry);
            });
        if (!list.children.length) {
            const empty = document.createElement('li');
            empty.textContent = 'No sales in this date range.';
            list.appendChild(empty);
        }
    }

    function renderOrderList() {
        const query = searchInput.value.trim().toLocaleLowerCase();
        const status = filterInput.value;
        const filtered = orders.filter(order => {
            const orderStatus = stageLabels[order.status] ? order.status : 'received';
            const searchable = `${order.id} ${order.address || ''} ${(order.items || []).map(item => item.title).join(' ')}`
                .toLocaleLowerCase();
            return (status === 'all' || orderStatus === status) && searchable.includes(query);
        });
        document.getElementById('orderCount').textContent =
            `${filtered.length} ${filtered.length === 1 ? 'order' : 'orders'}`;
        ordersList.replaceChildren();
        if (filtered.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty-panel';
            empty.textContent = orders.length ? 'No orders match these filters.' : 'No orders have been placed in this browser yet.';
            ordersList.appendChild(empty);
            return;
        }

        const pageSize = 10;
        const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
        ordersPage = Math.min(ordersPage, pageCount);
        const visible = filtered.slice((ordersPage - 1) * pageSize, ordersPage * pageSize);
        visible.forEach(order => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'admin-order-row';
            button.setAttribute('aria-pressed', String(order.id === selectedOrderId));
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'order-select';
            checkbox.checked = selectedOrderIds.has(order.id);
            checkbox.setAttribute('aria-label', `Select order ${order.id}`);
            const info = document.createElement('span');
            info.className = 'admin-order-row-info';
            const number = document.createElement('strong');
            number.textContent = `#${order.id}`;
            const summary = document.createElement('small');
            summary.textContent = `${(order.items || []).map(item => item.title).filter(Boolean).join(', ') || 'No items'} · ${new Date(order.createdAt || 0).toLocaleString()}`;
            info.append(number, summary);
            const state = document.createElement('span');
            state.className = 'order-state';
            state.textContent = stageLabels[order.status] || stageLabels.received;
            const total = document.createElement('strong');
            total.className = 'order-row-total';
            total.textContent = money(order.total);
            checkbox.addEventListener('click', event => {
                event.stopPropagation();
                if (checkbox.checked) selectedOrderIds.add(order.id);
                else selectedOrderIds.delete(order.id);
                updateBulkOrderControls();
            });
            button.append(checkbox, info, state, total);
            button.addEventListener('click', () => {
                selectedOrderId = order.id;
                renderOrderList();
                renderOrderDetail();
            });
            ordersList.appendChild(button);
        });
        const pagination = document.getElementById('ordersPagination');
        pagination.replaceChildren();
        for (let page = 1; page <= pageCount; page += 1) {
            const pageButton = document.createElement('button');
            pageButton.type = 'button';
            pageButton.textContent = String(page);
            pageButton.setAttribute('aria-current', page === ordersPage ? 'page' : 'false');
            pageButton.addEventListener('click', () => {
                ordersPage = page;
                renderOrderList();
            });
            pagination.appendChild(pageButton);
        }
    }

    function renderOrderDetail() {
        const order = orders.find(entry => entry.id === selectedOrderId);
        orderDetail.replaceChildren();
        if (!order) {
            const empty = document.createElement('p');
            empty.className = 'empty-panel';
            empty.textContent = 'Select an order to view its details.';
            orderDetail.appendChild(empty);
            return;
        }

        const title = document.createElement('h3');
        title.textContent = `Order #${order.id}`;
        const created = document.createElement('p');
        created.className = 'detail-timestamp';
        created.textContent = order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Date unavailable';
        const items = document.createElement('ul');
        items.className = 'detail-items';
        (Array.isArray(order.items) ? order.items : []).forEach(item => {
            const line = document.createElement('li');
            line.textContent = `${Number(item.quantity) || 1} × ${item.title || 'Item'} — ${money((Number(item.price) || 0) * (Number(item.quantity) || 1))}`;
            if (item.instructions) line.textContent += ` · Notes: ${item.instructions}`;
            items.appendChild(line);
        });
        const details = document.createElement('dl');
        details.className = 'order-detail-list';
        [
            ['Subtotal', money(order.subtotal)],
            ['Discount', money(order.discount)],
            ['Delivery fee', money(order.deliveryFee)],
            ['Service fee', money(order.serviceFee)],
            ['Tip', money(order.tip)],
            ['Total', money(order.total)],
            ['Address', order.address || 'No address provided'],
            ['Instructions', order.instructions || 'None'],
            ['Payment', order.payment || '—']
        ].forEach(([label, value]) => {
            const term = document.createElement('dt');
            term.textContent = label;
            const description = document.createElement('dd');
            description.textContent = value;
            details.append(term, description);
        });
        if (order.cancellationReason) {
            const term = document.createElement('dt');
            term.textContent = 'Cancellation reason';
            const description = document.createElement('dd');
            description.textContent = order.cancellationReason;
            details.append(term, description);
        }

        const statusLabel = document.createElement('label');
        statusLabel.htmlFor = 'selectedOrderStatus';
        statusLabel.className = 'field-label';
        statusLabel.textContent = 'Order status';
        const statusSelect = document.createElement('select');
        statusSelect.id = 'selectedOrderStatus';
        Object.entries(stageLabels).filter(([value]) => value !== 'cancelled').forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            statusSelect.appendChild(option);
        });
        statusSelect.value = stageLabels[order.status] ? order.status : 'received';
        statusSelect.disabled = order.status === 'cancelled';
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'admin-primary-button';
        save.textContent = 'Save status';
        save.disabled = order.status === 'cancelled';
        save.addEventListener('click', () => saveOrderStatus(order.id, statusSelect.value));

        const actions = document.createElement('div');
        actions.className = 'order-action-buttons';
        const print = document.createElement('button');
        print.type = 'button';
        print.className = 'table-action-button';
        print.textContent = 'Print order';
        print.addEventListener('click', () => {
            const printPanel = orderDetail.closest('.admin-panel');
            printPanel.classList.add('print-target');
            document.body.classList.add('printing-order');
            try {
                window.print();
            } finally {
                printPanel.classList.remove('print-target');
                document.body.classList.remove('printing-order');
            }
        });
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'table-action-button';
        copy.textContent = 'Copy summary';
        copy.addEventListener('click', async () => {
            const summary = [
                `Order #${order.id}`,
                `Status: ${stageLabels[order.status] || stageLabels.received}`,
                ...items.textContent.split('\n').filter(Boolean),
                `Total: ${money(order.total)}`,
                `Address: ${order.address || 'No address provided'}`
            ].join('\n');
            try {
                await navigator.clipboard.writeText(summary);
                showAdminMessage('Order summary copied.');
            } catch (error) {
                console.error('Unable to copy order summary:', error);
                showAdminMessage('Clipboard access is unavailable in this browser. Select and copy the order details manually.');
            }
        });
        actions.append(print, copy);
        const cancellationLabel = document.createElement('label');
        cancellationLabel.className = 'cancellation-reason-field';
        cancellationLabel.htmlFor = 'cancellationReasonInput';
        cancellationLabel.textContent = 'Cancellation reason';
        const cancellationReason = document.createElement('input');
        cancellationReason.id = 'cancellationReasonInput';
        cancellationReason.type = 'text';
        cancellationReason.maxLength = 200;
        cancellationReason.placeholder = 'Required to cancel';
        cancellationReason.value = order.cancellationReason || '';
        cancellationReason.disabled = order.status === 'cancelled' || order.status === 'delivered';
        cancellationLabel.appendChild(cancellationReason);
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'table-action-button table-remove-button';
        cancel.textContent = order.status === 'cancelled' ? 'Cancelled' : 'Cancel order';
        cancel.disabled = order.status === 'cancelled' || order.status === 'delivered';
        cancel.addEventListener('click', () => {
            const reason = cancellationReason.value.trim();
            if (!reason) {
                showAdminMessage('Cancellation was not saved. A reason is required.');
                cancellationReason.focus();
                return;
            }
            order.cancellationReason = reason;
            saveOrderStatus(order.id, 'cancelled');
        });
        actions.append(cancellationLabel, cancel);
        const etaField = document.createElement('label');
        etaField.className = 'eta-field';
        etaField.textContent = 'Estimated delivery';
        const etaInput = document.createElement('input');
        etaInput.type = 'datetime-local';
        etaInput.value = order.estimatedDelivery ? new Date(order.estimatedDelivery).toISOString().slice(0, 16) : '';
        etaField.appendChild(etaInput);

        const staffField = document.createElement('label');
        staffField.className = 'staff-field';
        staffField.textContent = 'Assigned staff';
        const staffInput = document.createElement('input');
        staffInput.type = 'text';
        staffInput.maxLength = 80;
        staffInput.placeholder = 'Staff member name';
        staffInput.value = order.assignedStaff || '';
        staffField.appendChild(staffInput);

        const refundField = document.createElement('label');
        refundField.className = 'refund-field';
        refundField.textContent = 'Refund amount';
        const refundInput = document.createElement('input');
        refundInput.type = 'number';
        refundInput.min = '0.01';
        refundInput.step = '0.01';
        refundInput.max = String(Math.max(0, Number(order.total) || 0));
        refundInput.value = String(Number(order.refundAmount) || '');
        refundField.appendChild(refundInput);

        const saveExtras = document.createElement('button');
        saveExtras.type = 'button';
        saveExtras.className = 'admin-primary-button';
        saveExtras.textContent = 'Save delivery details';
        saveExtras.addEventListener('click', () => {
            const refund = Number(refundInput.value) || 0;
            if (refund < 0 || refund > (Number(order.total) || 0)) {
                showAdminMessage('Refund must be between zero and the order total.');
                refundInput.focus();
                return;
            }
            order.estimatedDelivery = etaInput.value ? new Date(etaInput.value).toISOString() : undefined;
            order.assignedStaff = staffInput.value.trim();
            if (refund > 0) {
                order.refundAmount = refund;
                order.refundedAt = new Date().toISOString();
            } else {
                delete order.refundAmount;
                delete order.refundedAt;
            }
            try {
                localStorage.setItem(ordersKey, JSON.stringify(orders));
                const latest = readJSON(receiptKey, null);
                if (latest && latest.id === order.id) {
                    latest.estimatedDelivery = order.estimatedDelivery;
                    latest.assignedStaff = order.assignedStaff;
                    latest.refundAmount = order.refundAmount;
                    localStorage.setItem(receiptKey, JSON.stringify(latest));
                }
                addAuditEntry('update', `order ${order.id}`, refund > 0 ? `Refund ${money(refund)} recorded` : 'Delivery details updated');
                showAdminMessage('Delivery and refund details saved.');
                renderOrderDetail();
            } catch (error) {
                console.error('Unable to save delivery details:', error);
                showAdminMessage('Delivery details could not be saved.');
            }
        });
        const isAdmin = String(identity.role || '').toLocaleLowerCase() === 'admin';
        if (isAdmin) {
            orderDetail.append(title, created, items, details, statusLabel, statusSelect, save, actions,
                etaField, staffField, refundField, saveExtras);
        } else {
            orderDetail.append(title, created, items, details, statusLabel, statusSelect, save, actions,
                etaField, staffField);
        }
    }

    function showAdminMessage(message) {
        const notice = document.getElementById('newOrderNotice');
        notice.textContent = message;
        notice.hidden = false;
    }

    function saveOrderStatus(orderId, status) {
        const order = orders.find(entry => entry.id === orderId);
        if (!order || order.status === 'cancelled' || !stageLabels[status]) return;
        if (order.status === 'delivered' && status !== 'delivered') {
            window.alert('Delivered orders cannot be moved back to an earlier status.');
            return;
        }
        const previousStatus = order.status;
        const previousUpdatedAt = order.updatedAt;
        const previousCancellationReason = order.cancellationReason;
        const previousHistory = localStorage.getItem(ordersKey);
        const previousReceipt = localStorage.getItem(receiptKey);
        order.status = status;
        order.updatedAt = new Date().toISOString();
        try {
            localStorage.setItem(ordersKey, JSON.stringify(orders));
            const latest = readJSON(receiptKey, null);
            if (latest && latest.id === orderId) {
                latest.status = status;
                latest.updatedAt = order.updatedAt;
                if (order.cancellationReason) latest.cancellationReason = order.cancellationReason;
                localStorage.setItem(receiptKey, JSON.stringify(latest));
            }
        } catch (error) {
            console.error('Unable to save order status:', error);
            order.status = previousStatus;
            if (previousCancellationReason === undefined) delete order.cancellationReason;
            else order.cancellationReason = previousCancellationReason;
            if (previousUpdatedAt === undefined) delete order.updatedAt;
            else order.updatedAt = previousUpdatedAt;
            [[ordersKey, previousHistory], [receiptKey, previousReceipt]].forEach(([key, value]) => {
                try {
                    if (value === null) localStorage.removeItem(key);
                    else localStorage.setItem(key, value);
                } catch (restoreError) {
                    console.error(`Unable to restore ${key} after status update failed:`, restoreError);
                }
            });
            window.alert('The order status could not be saved. Check available browser storage and try again.');
            renderOrderList();
            renderOrderDetail();
            return;
        }
        addAuditEntry('status update', orderId, `${stageLabels[previousStatus] || previousStatus} to ${stageLabels[status]}`);
        orders = getOrders();
        renderMetrics();
        renderOrderList();
        renderOrderDetail();
        renderSalesReport();
    }

    searchInput.addEventListener('input', renderOrderList);
    filterInput.addEventListener('change', renderOrderList);
    function updateBulkOrderControls() {
        const count = selectedOrderIds.size;
        document.getElementById('selectedOrderCount').textContent = String(count);
        document.getElementById('bulkOrderActions').hidden = count === 0;
    }
    document.getElementById('selectAllOrdersButton').addEventListener('click', () => {
        orders.forEach(order => selectedOrderIds.add(order.id));
        updateBulkOrderControls();
        renderOrderList();
    });
    document.getElementById('clearSelectedOrdersButton').addEventListener('click', () => {
        selectedOrderIds.clear();
        updateBulkOrderControls();
        renderOrderList();
    });
    document.getElementById('applyBulkStatusButton').addEventListener('click', () => {
        const status = document.getElementById('bulkOrderStatus').value;
        const ids = [...selectedOrderIds];
        if (!ids.length) return;
        ids.forEach(id => saveOrderStatus(id, status));
        addAuditEntry('bulk update', `${ids.length} orders`, `Status changed to ${stageLabels[status]}`);
        selectedOrderIds.clear();
        updateBulkOrderControls();
        renderOrderList();
    });

    const backupKeys = [
        ordersKey,
        receiptKey,
        overridesKey,
        customProductsKey,
        auditKey,
        'biterush_cart',
        'biterush_favorites',
        'biterush_delivery',
        'biterush_voucher'
    ];
    const backupDefaults = {
        [ordersKey]: [],
        [receiptKey]: null,
        [overridesKey]: {},
        [customProductsKey]: [],
        [auditKey]: [],
        biterush_cart: [],
        biterush_favorites: [],
        biterush_delivery: {},
        biterush_voucher: ''
    };
    const dataToolsMessage = document.getElementById('dataToolsMessage');
    document.getElementById('exportDataButton').addEventListener('click', () => {
        const backup = { schemaVersion: 2, exportedAt: new Date().toISOString(), data: {} };
        backupKeys.forEach(key => {
            backup.data[key] = readJSON(key, backupDefaults[key]);
        });
        const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = `biterush-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        dataToolsMessage.textContent = 'Backup downloaded. Store it somewhere private; it may contain customer addresses and order history.';
        dataToolsMessage.hidden = false;
    });
    const importDataFile = document.getElementById('importDataFile');
    importDataFile.addEventListener('change', async event => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) return;
        try {
            if (file.size > 5 * 1024 * 1024) throw new Error('Backup file is larger than 5 MB.');
            const backup = JSON.parse(await file.text());
            if (![1, 2].includes(backup.schemaVersion) || !backup.data || typeof backup.data !== 'object'
                || Array.isArray(backup.data)) {
                throw new Error('This backup file format is not supported.');
            }
            const data = backup.data;
            const validOrders = Array.isArray(data[ordersKey])
                && data[ordersKey].every(order => order && typeof order.id === 'string'
                    && Array.isArray(order.items));
            const validCustomProducts = Array.isArray(data[customProductsKey])
                && data[customProductsKey].every(product => product && typeof product.title === 'string'
                    && Number.isFinite(Number(product.price))                     && (product.stock === undefined || product.stock === null
                        || (Number.isSafeInteger(Number(product.stock)) && Number(product.stock) >= 0)));
            const customProductIds = validCustomProducts
                ? data[customProductsKey].map(product => product.id).filter(Boolean)
                : [];
            const validCustomProductIds = customProductIds.length === new Set(customProductIds).size;
            const validCart = Array.isArray(data.biterush_cart)
                && data.biterush_cart.every(item => item && typeof item.title === 'string'
                    && Number.isFinite(Number(item.price)) && Number.isSafeInteger(Number(item.quantity)));
            const validFavorites = Array.isArray(data.biterush_favorites);
            const validOverrides = data[overridesKey] && typeof data[overridesKey] === 'object'
                && !Array.isArray(data[overridesKey]);
            const validReceipt = data[receiptKey] === null
                || (data[receiptKey] && typeof data[receiptKey].id === 'string'
                    && Array.isArray(data[receiptKey].items));
            const validDelivery = data.biterush_delivery && typeof data.biterush_delivery === 'object'
                && !Array.isArray(data.biterush_delivery);
            if (!validOrders || !validCustomProducts || !validCustomProductIds || !validCart || !validFavorites
                || !validOverrides || !validReceipt || !validDelivery
                || typeof data.biterush_voucher !== 'string') {
                throw new Error('The backup is missing valid order or menu data.');
            }
            data[customProductsKey] = data[customProductsKey].map(product => ({
                ...product,
                id: product.id || (window.crypto?.randomUUID
                    ? window.crypto.randomUUID()
                    : `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
            }));
            if (!window.confirm('Restore this backup? It will replace saved orders, menu settings, cart, favorites, delivery details, and vouchers in this browser.')) return;
            const previous = Object.fromEntries(backupKeys.map(key => [key, localStorage.getItem(key)]));
            try {
                backupKeys.forEach(key => {
                    const value = backup.data[key];
                    if (value === null || value === undefined) localStorage.removeItem(key);
                    else localStorage.setItem(key, JSON.stringify(value));
                });
                localStorage.removeItem('biterush_product_undo');
            } catch (error) {
                backupKeys.forEach(key => {
                    try {
                        if (previous[key] === null) localStorage.removeItem(key);
                        else localStorage.setItem(key, previous[key]);
                    } catch (restoreError) {
                        console.error(`Unable to restore ${key} after backup import failed:`, restoreError);
                    }
                });
                throw error;
            }
            orders = getOrders();
            knownOrderIds.clear();
            orders.forEach(order => knownOrderIds.add(order.id));
            overrides = readJSON(overridesKey, {});
            customProducts = readJSON(customProductsKey, []);
            renderMetrics();
            renderOrderList();
            renderOrderDetail();
            renderSalesReport();
            renderProducts();
            updateUndoButton();
            renderFeedback();
            dataToolsMessage.textContent = 'Backup restored in this browser.';
            dataToolsMessage.hidden = false;
        } catch (error) {
            console.error('Unable to restore BiteRush backup:', error);
            dataToolsMessage.textContent = error.message || 'Could not restore the backup.';
            dataToolsMessage.hidden = false;
        } finally {
            input.value = '';
        }
    });

    const reportStart = document.getElementById('reportStart');
    const reportEnd = document.getElementById('reportEnd');
    const today = new Date();
    const twoDigits = value => String(value).padStart(2, '0');
    const todayValue = `${today.getFullYear()}-${twoDigits(today.getMonth() + 1)}-${twoDigits(today.getDate())}`;
    reportStart.value = `${todayValue.slice(0, 7)}-01`;
    reportEnd.value = todayValue;
    document.getElementById('runReportButton').addEventListener('click', renderSalesReport);
    document.getElementById('exportReportCsvButton').addEventListener('click', () => {
        const start = new Date(`${reportStart.value}T00:00:00`);
        const end = new Date(`${reportEnd.value}T23:59:59`);
        const included = orders.filter(order => {
            const date = new Date(order.createdAt || 0);
            return !Number.isNaN(date.getTime()) && date >= start && date <= end && order.status !== 'cancelled';
        });
        const csv = [
            ['order', 'date', 'status', 'subtotal', 'discount', 'delivery_fee', 'service_fee', 'tip', 'total', 'refund'],
            ...included.map(order => [
                order.id, order.createdAt, order.status, order.subtotal || 0, order.discount || 0,
                order.deliveryFee || 0, order.serviceFee || 0, order.tip || 0, order.total || 0, order.refundAmount || 0
            ])
        ].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `biterush-report-${reportStart.value}-${reportEnd.value}.csv`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        addAuditEntry('export', 'sales report', `${included.length} orders exported`);
    });

    const dishRecords = Array.isArray(window.BITERUSH_DISHES) ? window.BITERUSH_DISHES : [];
    const defaultProducts = new Map();
    dishRecords.forEach(dish => {
        const title = String(dish.title || '').trim();
        const key = normalizeTitle(title);
        const match = String(dish.price || '').match(/(\d+(?:\.\d+)?)\s*$/);
        if (title && !defaultProducts.has(key) && match) {
            defaultProducts.set(key, {
                title,
                price: Number(match[1]),
                category: dish.category || dish.menu || 'Menu',
                description: dish.description || '',
                image: dish.image || ''
            });
        }
    });
    let overrides = readJSON(overridesKey, {});
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) overrides = {};
    let customProducts = readJSON(customProductsKey, []);
    if (!Array.isArray(customProducts)) customProducts = [];
    const productSearch = document.getElementById('productSearch');
    const productsList = document.getElementById('productsList');
    const productMessage = document.getElementById('productMessage');
    const selectedProductKeys = new Set();
    let productsPage = 1;
    const productsPerPage = 10;
    const undoKey = 'biterush_product_undo';
    const undoButton = document.getElementById('undoProductButton');
    const readUndo = () => readJSON(undoKey, null);
    const updateUndoButton = () => {
        undoButton.disabled = !readUndo();
    };
    const saveUndoSnapshot = () => {
        try {
            localStorage.setItem(undoKey, JSON.stringify({ customProducts, overrides }));
            updateUndoButton();
            return true;
        } catch (error) {
            console.error('Unable to save menu undo snapshot:', error);
            productMessage.textContent = 'Could not save an undo point, so the menu change was not made.';
            productMessage.hidden = false;
            return false;
        }
    };
    undoButton.addEventListener('click', () => {
        const previous = readUndo();
        if (!previous || !Array.isArray(previous.customProducts)
            || !previous.overrides || typeof previous.overrides !== 'object') return;
        const previousProducts = localStorage.getItem(customProductsKey);
        const previousOverrides = localStorage.getItem(overridesKey);
        try {
            localStorage.setItem(customProductsKey, JSON.stringify(previous.customProducts));
            localStorage.setItem(overridesKey, JSON.stringify(previous.overrides));
            customProducts = previous.customProducts;
            overrides = previous.overrides;
            localStorage.removeItem(undoKey);
            updateUndoButton();
            productMessage.textContent = 'Undid the last menu change.';
            productMessage.hidden = false;
            renderProducts();
            window.dispatchEvent(new Event('biterush-menu-updated'));
        } catch (error) {
            console.error('Unable to undo menu change:', error);
            [[customProductsKey, previousProducts], [overridesKey, previousOverrides]].forEach(([key, value]) => {
                try {
                    if (value === null) localStorage.removeItem(key);
                    else localStorage.setItem(key, value);
                } catch (restoreError) {
                    console.error(`Unable to restore ${key} after undo failed:`, restoreError);
                }
            });
            productMessage.textContent = 'The menu change could not be undone.';
            productMessage.hidden = false;
        }
    });
    updateUndoButton();

    function renderProducts() {
        const query = normalizeTitle(productSearch.value);
        const statusFilter = document.getElementById('productStatusFilter').value;
        const categoryFilter = document.getElementById('productCategoryFilter')?.value || 'all';
        const stockFilter = document.getElementById('productStockFilter')?.value || 'all';
        const lifecycleFilter = document.getElementById('productLifecycleFilter')?.value || 'all';
        productsList.replaceChildren();
        const products = [...defaultProducts.values(), ...customProducts]
            .filter(product => normalizeTitle(product.title).includes(query))
            .filter(product => {
                const key = normalizeTitle(product.title);
                const override = overrides[key] || {};
                const deleted = customProducts.some(customProduct =>
                    normalizeTitle(customProduct.title) === key && customProduct.deleted === true
                ) || override.deleted === true;
                if (statusFilter === 'deleted') return deleted;
                if (deleted) return false;
                if (statusFilter === 'available') return override.available !== false;
                if (statusFilter === 'unavailable') return override.available === false;
                return true;
            })
            .filter(product => {
                const key = normalizeTitle(product.title);
                const override = overrides[key] || {};
                const category = String(override.category || product.category || 'Menu');
                if (categoryFilter !== 'all' && category !== categoryFilter) return false;
                const lifecycle = override.lifecycle || product.lifecycle || 'active';
                if (lifecycleFilter !== 'all' && lifecycle !== lifecycleFilter) return false;
                const stockValue = override.stock ?? product.stock;
                const stock = stockValue === undefined || stockValue === null || stockValue === '' ? null : Number(stockValue);
                const threshold = Number(override.lowStockThreshold ?? product.lowStockThreshold ?? 5);
                if (stockFilter === 'low') return stock !== null && Number.isFinite(stock) && stock > 0 && stock <= threshold;
                if (stockFilter === 'out') return stock !== null && stock === 0;
                if (stockFilter === 'unlimited') return stock === null;
                return true;
            });
        const categorySelect = document.getElementById('productCategoryFilter');
        if (categorySelect) {
            const selectedCategory = categorySelect.value;
            const categories = [...new Set([...defaultProducts.values(), ...customProducts]
                .map(product => String((overrides[normalizeTitle(product.title)] || {}).category || product.category || 'Menu'))
                .filter(Boolean))]
                .sort((first, second) => first.localeCompare(second));
            categorySelect.replaceChildren(new Option('All categories', 'all'));
            categories.forEach(category => categorySelect.add(new Option(category, category)));
            if (selectedCategory && [...categorySelect.options].some(option => option.value === selectedCategory)) {
                categorySelect.value = selectedCategory;
            }
        }
        const productSort = document.getElementById('productSort')?.value || 'name';
        products.sort((first, second) => {
            const firstKey = normalizeTitle(first.title);
            const secondKey = normalizeTitle(second.title);
            const firstOverride = overrides[firstKey] || {};
            const secondOverride = overrides[secondKey] || {};
            const firstPrice = Number(firstOverride.price ?? first.price) || 0;
            const secondPrice = Number(secondOverride.price ?? second.price) || 0;
            const firstStock = Number(firstOverride.stock ?? first.stock);
            const secondStock = Number(secondOverride.stock ?? second.stock);
            if (productSort === 'category') return String(firstOverride.category || first.category || '').localeCompare(String(secondOverride.category || second.category || ''));
            if (productSort === 'price-low') return firstPrice - secondPrice;
            if (productSort === 'price-high') return secondPrice - firstPrice;
            if (productSort === 'stock-low') return (Number.isFinite(firstStock) ? firstStock : Infinity) - (Number.isFinite(secondStock) ? secondStock : Infinity);
            if (productSort === 'updated') return new Date(secondOverride.updatedAt || second.updatedAt || 0) - new Date(firstOverride.updatedAt || first.updatedAt || 0);
            return String(first.title).localeCompare(String(second.title));
        });
        if (products.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 12;
            cell.textContent = 'No dishes match your search.';
            row.appendChild(cell);
            productsList.appendChild(row);
            document.getElementById('productsPagination').replaceChildren();
            return;
        }

        const productsPageCount = Math.max(1, Math.ceil(products.length / productsPerPage));
        productsPage = Math.min(productsPage, productsPageCount);
        const pageProducts = products.slice((productsPage - 1) * productsPerPage, productsPage * productsPerPage);
        pageProducts.forEach(product => {
            const key = normalizeTitle(product.title);
            const isCustomProduct = customProducts.some(customProduct =>
                normalizeTitle(customProduct.title) === key
            );
            const override = overrides[key] || {};
            const row = document.createElement('tr');
            const selectCell = document.createElement('td');
            const selectInput = document.createElement('input');
            selectInput.type = 'checkbox';
            selectInput.className = 'product-row-select';
            selectInput.dataset.productKey = key;
            selectInput.checked = selectedProductKeys.has(key);
            selectInput.setAttribute('aria-label', `Select ${product.title}`);
            selectInput.addEventListener('change', () => {
                if (selectInput.checked) selectedProductKeys.add(key);
                else selectedProductKeys.delete(key);
                updateBulkProductControls();
            });
            selectCell.appendChild(selectInput);
            const name = document.createElement('th');
            name.scope = 'row';
            name.className = 'product-name-cell';
            const thumbnail = document.createElement('img');
            thumbnail.className = 'product-thumbnail';
            thumbnail.alt = '';
            thumbnail.src = override.image || product.image || new URL('../BiteRushHomePage/HomePagePics/burger.png', window.location.href).href;
            const nameText = document.createElement('span');
            nameText.textContent = product.title;
            nameText.className = 'product-name-text';
            const nameMeta = document.createElement('small');
            nameMeta.className = 'product-meta';
            nameMeta.textContent = override.updatedAt
                ? `Updated ${new Date(override.updatedAt).toLocaleString()}`
                : product.updatedAt ? `Updated ${new Date(product.updatedAt).toLocaleString()}` : `ID ${product.id || key}`;
            const nameDetails = document.createElement('div');
            nameDetails.className = 'product-name-details';
            nameDetails.append(nameText, nameMeta);
            name.append(thumbnail, nameDetails);
            const categoryCell = document.createElement('td');
            const categoryInput = document.createElement('input');
            categoryInput.type = 'text';
            categoryInput.maxLength = 50;
            categoryInput.value = override.category || product.category || 'Menu';
            categoryInput.setAttribute('aria-label', `${product.title} category`);
            categoryCell.appendChild(categoryInput);
            const descriptionCell = document.createElement('td');
            const descriptionInput = document.createElement('input');
            descriptionInput.type = 'text';
            descriptionInput.maxLength = 180;
            descriptionInput.value = override.description || product.description || '';
            descriptionInput.setAttribute('aria-label', `${product.title} description`);
            descriptionCell.appendChild(descriptionInput);
            const priceCell = document.createElement('td');
            const priceInput = document.createElement('input');
            priceInput.type = 'number';
            priceInput.min = '0.01';
            priceInput.step = '0.01';
            priceInput.value = String(Number.isFinite(Number(override.price)) ? Number(override.price) : product.price);
            priceInput.setAttribute('aria-label', `${product.title} price`);
            priceCell.appendChild(priceInput);
            const availabilityCell = document.createElement('td');
            const availabilityLabel = document.createElement('label');
            availabilityLabel.className = 'availability-control';
            const availableInput = document.createElement('input');
            availableInput.type = 'checkbox';
            availableInput.checked = override.available !== false;
            availableInput.setAttribute('aria-label', `${product.title} available`);
            const availabilityText = document.createElement('span');
            availabilityText.textContent = 'Available';
            availableInput.addEventListener('change', () => {
                availabilityText.textContent = availableInput.checked ? 'Available' : 'Unavailable';
            });
            availabilityText.textContent = availableInput.checked ? 'Available' : 'Unavailable';
            availabilityLabel.append(availableInput, availabilityText);
            availabilityCell.appendChild(availabilityLabel);
            const stockCell = document.createElement('td');
            stockCell.className = 'stock-cell';
            const stockInput = document.createElement('input');
            stockInput.type = 'number';
            stockInput.min = '0';
            stockInput.step = '1';
            const stockValue = override.stock ?? product.stock;
            stockInput.value = stockValue !== undefined && stockValue !== null && stockValue !== ''
                ? String(Math.max(0, Number.parseInt(stockValue, 10) || 0))
                : '';
            stockInput.setAttribute('aria-label', `${product.title} stock quantity`);
            const stockBadge = document.createElement('span');
            stockBadge.className = 'stock-badge';
            if (!stockInput.value.trim()) stockBadge.textContent = 'Unlimited';
            else if (Number(stockInput.value) === 0) {
                stockBadge.classList.add('out');
                stockBadge.textContent = 'Out of stock';
            } else if (Number(stockInput.value) <= Number(override.lowStockThreshold ?? product.lowStockThreshold ?? 5)) {
                stockBadge.classList.add('low');
                stockBadge.textContent = 'Low stock';
            } else stockBadge.textContent = 'In stock';
            const stockControl = document.createElement('div');
            stockControl.className = 'stock-control';
            stockControl.append(stockInput, stockBadge);
            stockCell.appendChild(stockControl);
            const prepCell = document.createElement('td');
            const prepInput = document.createElement('input');
            prepInput.type = 'number';
            prepInput.min = '0';
            prepInput.step = '1';
            prepInput.value = String(Number.isFinite(Number(override.prepTime ?? product.prepTime ?? 0)) ? Math.max(0, Number(override.prepTime ?? product.prepTime ?? 0)) : 0);
            prepInput.setAttribute('aria-label', `${product.title} preparation time`);
            prepCell.appendChild(prepInput);
            const skuCell = document.createElement('td');
            const skuInput = document.createElement('input');
            skuInput.type = 'text';
            skuInput.maxLength = 40;
            skuInput.value = override.sku || product.sku || '';
            skuInput.setAttribute('aria-label', `${product.title} SKU`);
            skuCell.appendChild(skuInput);
            const imageCell = document.createElement('td');
            const imageInput = document.createElement('input');
            imageInput.type = 'text';
            imageInput.maxLength = 300;
            imageInput.value = override.image || (product.image
                ? new URL(product.image, new URL('../SearchResults/', window.location.href)).href
                : '');
            imageInput.setAttribute('aria-label', `${product.title} image URL`);
            imageCell.appendChild(imageInput);
            const actionCell = document.createElement('td');
            actionCell.className = 'product-action-buttons';
            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'table-action-button';
            saveButton.textContent = 'Save';
            saveButton.addEventListener('click', () => {
                if (!priceInput.value.trim()) {
                    productMessage.textContent = 'Enter a valid price greater than zero.';
                    productMessage.hidden = false;
                    priceInput.focus();
                    return;
                }
                const price = Number(priceInput.value);
                if (!Number.isFinite(price) || price <= 0) {
                    productMessage.textContent = 'Enter a valid price greater than zero.';
                    productMessage.hidden = false;
                    priceInput.focus();
                    return;
                }
                if (stockInput.value.trim() && Number(stockInput.value) === 0 && availableInput.checked) {
                    if (!window.confirm('This product has zero stock. Mark it unavailable?')) return;
                    availableInput.checked = false;
                    availabilityText.textContent = 'Unavailable';
                }
                const image = imageInput.value.trim();
                let normalizedImage = '';
                if (image) {
                    try {
                        const parsedImage = new URL(image, window.location.href);
                        if (!['http:', 'https:', 'file:'].includes(parsedImage.protocol)) {
                            throw new Error('Unsupported image URL protocol.');
                        }
                        normalizedImage = parsedImage.href;
                    } catch (error) {
                        productMessage.textContent = 'Use a valid HTTP, HTTPS, or local image URL.';
                        productMessage.hidden = false;
                        imageInput.focus();
                        return;
                    }
                }
                if (!saveUndoSnapshot()) return;
                const previousOverride = overrides[key];
                const stockValue = stockInput.value.trim()
                    ? Math.max(0, Number.parseInt(stockInput.value, 10) || 0)
                    : null;
                overrides[key] = {
                    ...previousOverride,
                    price,
                    available: availableInput.checked,
                    category: categoryInput.value.trim() || 'Menu',
                    description: descriptionInput.value.trim(),
                    image: normalizedImage,
                    prepTime: Math.max(0, Number.parseInt(prepInput.value, 10) || 0),
                    sku: skuInput.value.trim(),
                    updatedAt: new Date().toISOString(),
                    updatedBy: identity.name || identity.username || 'Administrator'
                };
                if (stockValue === null) delete overrides[key].stock;
                else overrides[key].stock = stockValue;
                try {
                    localStorage.setItem(overridesKey, JSON.stringify(overrides));
                    productMessage.textContent = `${product.title} updated. Matching items use this title-wide setting.`;
                    productMessage.hidden = false;
                    addAuditEntry('update', product.title, `Price ${money(price)}, stock ${stockInput.value}, availability ${availableInput.checked ? 'available' : 'unavailable'}`);
                    window.dispatchEvent(new Event('biterush-menu-updated'));
                } catch (error) {
                    console.error('Unable to save product settings:', error);
                    if (previousOverride === undefined) delete overrides[key];
                    else overrides[key] = previousOverride;
                    try {
                        localStorage.removeItem(undoKey);
                    } catch (cleanupError) {
                        console.error('Unable to clear unused menu undo snapshot:', cleanupError);
                    }
                    updateUndoButton();
                    productMessage.textContent = 'Product settings could not be saved in this browser.';
                    productMessage.hidden = false;
                }
            });
            actionCell.appendChild(saveButton);
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'table-action-button';
            editButton.textContent = 'Edit';
            editButton.setAttribute('aria-label', `Edit ${product.title}`);
            editButton.addEventListener('click', () => openProductEditor(product, key));
            actionCell.appendChild(editButton);
            if (isCustomProduct || defaultProducts.has(key)) {
                const removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.className = 'table-action-button table-remove-button';
                const deleted = product.deleted === true || override.deleted === true;
                removeButton.textContent = deleted ? 'Restore' : 'Recycle';
                removeButton.setAttribute('aria-label', `${deleted ? 'Restore' : 'Move to recycle bin'} ${product.title}`);
                removeButton.addEventListener('click', () => {
                    const action = deleted ? 'restore' : 'move to the recycle bin';
                    if (!window.confirm(`${deleted ? 'Restore' : 'Move'} "${product.title}" ${deleted ? 'to the menu?' : 'to the recycle bin?'}`)) return;
                    if (!saveUndoSnapshot()) return;
                    const previousProducts = [...customProducts];
                    const previousProductsStorage = localStorage.getItem(customProductsKey);
                    const previousOverrides = { ...overrides };
                    const previousOverridesStorage = localStorage.getItem(overridesKey);
                    if (isCustomProduct) {
                        customProducts = customProducts.map(customProduct =>
                            normalizeTitle(customProduct.title) === key
                                ? { ...customProduct, deleted: !deleted }
                                : customProduct
                        );
                    } else {
                        overrides[key] = { ...overrides[key], deleted: !deleted };
                    }
                    try {
                        if (isCustomProduct) {
                            localStorage.setItem(customProductsKey, JSON.stringify(customProducts));
                        } else {
                            localStorage.setItem(overridesKey, JSON.stringify(overrides));
                        }
                        productMessage.textContent = `${product.title} ${deleted ? 'restored to the menu' : 'moved to the recycle bin'}.`;
                        productMessage.hidden = false;
                        addAuditEntry(deleted ? 'restore' : 'recycle', product.title, action);
                        renderProducts();
                        window.dispatchEvent(new Event('biterush-menu-updated'));
                    } catch (error) {
                        console.error('Unable to change custom product recycle state:', error);
                        customProducts = previousProducts;
                        overrides = previousOverrides;
                        try {
                            if (previousProductsStorage === null) {
                                localStorage.removeItem(customProductsKey);
                            } else {
                                localStorage.setItem(customProductsKey, previousProductsStorage);
                            }
                            if (previousOverridesStorage === null) {
                                localStorage.removeItem(overridesKey);
                            } else {
                                localStorage.setItem(overridesKey, previousOverridesStorage);
                            }
                        } catch (restoreError) {
                            console.error('Unable to restore product settings after removal failed:', restoreError);
                        }
                        productMessage.textContent = 'The dish could not be removed. Please try again.';
                        productMessage.hidden = false;
                        localStorage.removeItem(undoKey);
                        updateUndoButton();
                    }
                });
                actionCell.appendChild(removeButton);
                if (isCustomProduct && deleted) {
                    const permanentButton = document.createElement('button');
                    permanentButton.type = 'button';
                    permanentButton.className = 'table-action-button table-remove-button';
                    permanentButton.textContent = 'Delete forever';
                    permanentButton.addEventListener('click', () => permanentlyDeleteProduct(product, key));
                    actionCell.appendChild(permanentButton);
                }
            }
            const salesCell = document.createElement('td');
            const soldItems = orders.flatMap(order => (order.items || []).filter(item =>
                normalizeTitle(item.title) === key && order.status !== 'cancelled'
            ));
            const units = soldItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
            const revenue = soldItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
            salesCell.className = 'product-sales';
            salesCell.innerHTML = `<strong>${units} sold</strong><br><span class="product-meta">${money(revenue)}</span>`;
            row.append(selectCell, name, categoryCell, descriptionCell, priceCell, availabilityCell, stockCell, prepCell, skuCell, imageCell, salesCell, actionCell);
            productsList.appendChild(row);
        });
        const pagination = document.getElementById('productsPagination');
        pagination.replaceChildren();
        for (let page = 1; page <= productsPageCount; page += 1) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = String(page);
            button.className = page === productsPage ? 'pagination-button active' : 'pagination-button';
            button.setAttribute('aria-label', `Page ${page} of ${productsPageCount}`);
            button.addEventListener('click', () => {
                productsPage = page;
                renderProducts();
            });
            pagination.appendChild(button);
        }
    }

    const resetProductPageAndRender = () => {
        productsPage = 1;
        renderProducts();
    };
    productSearch.addEventListener('input', resetProductPageAndRender);
    document.getElementById('productStatusFilter').addEventListener('change', resetProductPageAndRender);
    document.getElementById('productCategoryFilter').addEventListener('change', resetProductPageAndRender);
    document.getElementById('productStockFilter').addEventListener('change', resetProductPageAndRender);
    document.getElementById('productLifecycleFilter').addEventListener('change', resetProductPageAndRender);
    document.getElementById('productSort').addEventListener('change', resetProductPageAndRender);

    function updateBulkProductControls() {
        document.getElementById('selectedProductCount').textContent = String(selectedProductKeys.size);
        document.getElementById('bulkProductActions').hidden = selectedProductKeys.size === 0;
    }

    document.getElementById('selectAllProducts').addEventListener('change', event => {
        document.querySelectorAll('#productsList .product-row-select').forEach(input => {
            const key = input.dataset.productKey;
            if (event.target.checked) selectedProductKeys.add(key);
            else selectedProductKeys.delete(key);
            input.checked = event.target.checked;
        });
        updateBulkProductControls();
    });

    const applyBulkProductChange = (mode) => {
        if (!selectedProductKeys.size) return;
        const labels = {
            available: 'mark available',
            unavailable: 'mark unavailable',
            recycle: 'move to the recycle bin',
            restore: 'restore',
            category: 'change category',
            price: 'change price',
            stock: 'change stock'
        };
        if (!window.confirm(`${selectedProductKeys.size} dish(es) will be ${labels[mode]}.`)) return;
        if (!saveUndoSnapshot()) return;
        selectedProductKeys.forEach(key => {
            const customIndex = customProducts.findIndex(product => normalizeTitle(product.title) === key);
            if (mode === 'available' || mode === 'unavailable') {
                overrides[key] = {
                    ...(overrides[key] || {}),
                    available: mode === 'available',
                    updatedAt: new Date().toISOString(),
                    updatedBy: identity.name || identity.username || 'Administrator'
                };
            } else if (customIndex !== -1) {
                customProducts[customIndex] = {
                    ...customProducts[customIndex],
                    deleted: mode === 'recycle',
                    updatedAt: new Date().toISOString(),
                    updatedBy: identity.name || identity.username || 'Administrator'
                };
            } else {
                overrides[key] = { ...(overrides[key] || {}), deleted: mode === 'recycle' };
            }
        });
        try {
            localStorage.setItem(overridesKey, JSON.stringify(overrides));
            localStorage.setItem(customProductsKey, JSON.stringify(customProducts));
            const revisionsKey = 'biterush_product_revisions';
            let revisions = readJSON(revisionsKey, []);
            if (!Array.isArray(revisions)) revisions = [];
            revisions.unshift({
                at: new Date().toISOString(),
                actor: identity.name || identity.username || 'Administrator',
                productKey: key,
                before: { overrides: previousOverrides, customProducts: previousCustomProducts },
                after: { overrides: JSON.stringify(overrides), customProducts: JSON.stringify(customProducts) }
            });
            localStorage.setItem(revisionsKey, JSON.stringify(revisions.slice(0, 100)));
            localStorage.removeItem(productDraftKey);
            addAuditEntry('bulk menu update', `${selectedProductKeys.size} products`, labels[mode]);
            selectedProductKeys.clear();
            updateBulkProductControls();
            renderProducts();
            window.dispatchEvent(new Event('biterush-menu-updated'));
            productMessage.textContent = 'Bulk menu update complete.';
            productMessage.hidden = false;
        } catch (error) {
            console.error('Unable to apply bulk menu update:', error);
            productMessage.textContent = 'Bulk menu update could not be saved.';
            productMessage.hidden = false;
        }
    };
    document.getElementById('bulkProductAvailable').addEventListener('click', () => applyBulkProductChange('available'));
    document.getElementById('bulkProductUnavailable').addEventListener('click', () => applyBulkProductChange('unavailable'));
    document.getElementById('bulkProductRecycle').addEventListener('click', () => applyBulkProductChange('recycle'));
    document.getElementById('bulkProductRestore').addEventListener('click', () => applyBulkProductChange('restore'));
    const applyBulkProductFields = field => {
        if (!selectedProductKeys.size) return;
        const inputId = field === 'category'
            ? 'bulkProductCategory'
            : field === 'price' ? 'bulkProductPrice' : 'bulkProductStock';
        const rawValue = document.getElementById(inputId).value.trim();
        if (!rawValue) {
            productMessage.textContent = `Enter a value before applying the bulk ${field} change.`;
            productMessage.hidden = false;
            return;
        }
        const category = rawValue;
        const numberValue = Number(rawValue);
        if ((field === 'price' && (!Number.isFinite(numberValue) || numberValue <= 0))
            || (field === 'stock' && (!Number.isSafeInteger(numberValue) || numberValue < 0))) {
            productMessage.textContent = 'Enter a valid bulk value.';
            productMessage.hidden = false;
            return;
        }
        if (!window.confirm(`Apply ${field} to ${selectedProductKeys.size} selected dish(es)?`)) return;
        if (!saveUndoSnapshot()) return;
        selectedProductKeys.forEach(key => {
            const customIndex = customProducts.findIndex(product => normalizeTitle(product.title) === key);
            if (customIndex !== -1) {
                customProducts[customIndex] = {
                    ...customProducts[customIndex],
                    ...(field === 'category' ? { category } : {}),
                    ...(field === 'price' ? { price: numberValue } : {}),
                    ...(field === 'stock' ? { stock: numberValue } : {}),
                    updatedAt: new Date().toISOString(),
                    updatedBy: identity.name || identity.username || 'Administrator'
                };
            } else {
                overrides[key] = {
                    ...(overrides[key] || {}),
                    ...(field === 'category' ? { category } : {}),
                    ...(field === 'price' ? { price: numberValue } : {}),
                    ...(field === 'stock' ? { stock: numberValue } : {}),
                    updatedAt: new Date().toISOString(),
                    updatedBy: identity.name || identity.username || 'Administrator'
                };
            }
        });
        try {
            localStorage.setItem(overridesKey, JSON.stringify(overrides));
            localStorage.setItem(customProductsKey, JSON.stringify(customProducts));
            addAuditEntry('bulk menu update', `${selectedProductKeys.size} products`, `Bulk ${field} changed`);
            selectedProductKeys.clear();
            updateBulkProductControls();
            renderProducts();
            window.dispatchEvent(new Event('biterush-menu-updated'));
            productMessage.textContent = `Bulk ${field} update complete.`;
            productMessage.hidden = false;
        } catch (error) {
            console.error('Unable to apply bulk product field update:', error);
            productMessage.textContent = 'Bulk menu update could not be saved.';
            productMessage.hidden = false;
        }
    };
    document.getElementById('bulkProductCategoryButton').addEventListener('click', () => applyBulkProductFields('category'));
    document.getElementById('bulkProductPriceButton').addEventListener('click', () => applyBulkProductFields('price'));
    document.getElementById('bulkProductStockButton').addEventListener('click', () => applyBulkProductFields('stock'));
    document.getElementById('clearSelectedProducts').addEventListener('click', () => {
        selectedProductKeys.clear();
        updateBulkProductControls();
        renderProducts();
    });

    let productEditorDirty = false;
    const productEditDialog = document.getElementById('productEditDialog');
    const productDraftKey = 'biterush_product_edit_draft';
    const editProductInputs = [
        document.getElementById('editProductName'),
        document.getElementById('editProductCategory'),
        document.getElementById('editProductPrice'),
        document.getElementById('editProductStock'),
        document.getElementById('editProductPrepTime'),
        document.getElementById('editProductSku'),
        document.getElementById('editProductDescription'),
        document.getElementById('editProductImage'),
        document.getElementById('editProductBarcode'),
        document.getElementById('editProductCost'),
        document.getElementById('editProductLowStock'),
        document.getElementById('editProductLifecycle'),
        document.getElementById('editProductAllergens'),
        document.getElementById('editProductTags'),
        document.getElementById('editProductVariants'),
        document.getElementById('editProductAddons'),
        document.getElementById('editProductNotes'),
        document.getElementById('editProductScheduleStart'),
        document.getElementById('editProductScheduleEnd'),
        document.getElementById('editProductAvailable')
    ];

    const overrideSkuConflict = (sku, exceptIndex = -1) => {
        const normalizedSku = String(sku || '').trim().toLocaleLowerCase();
        if (!normalizedSku) return false;
        return customProducts.some((product, index) =>
            index !== exceptIndex && product.deleted !== true
            && String(product.sku || '').trim().toLocaleLowerCase() === normalizedSku
        );
    };

    const updateProductPreview = () => {
        document.getElementById('editProductPreviewName').textContent =
            document.getElementById('editProductName').value || 'Product name';
        document.getElementById('editProductPreviewCategory').textContent =
            document.getElementById('editProductCategory').value || 'Category';
        document.getElementById('editProductPreviewDescription').textContent =
            document.getElementById('editProductDescription').value || 'Product description';
        const price = Number(document.getElementById('editProductPrice').value);
        const message = document.getElementById('editProductMessage');
        document.getElementById('editProductPreviewPrice').textContent =
            Number.isFinite(price) ? money(price) : '₱0.00';
        document.getElementById('editProductPreviewImage').src =
            document.getElementById('editProductImage').value || new URL('../BiteRushHomePage/HomePagePics/burger.png', window.location.href).href;
    };

    function openProductEditor(product, key) {
        const override = overrides[key] || {};
        const custom = customProducts.find(item => normalizeTitle(item.title) === key);
        document.getElementById('editProductKey').value = key;
        document.getElementById('editProductName').value = override.title || product.title;
        document.getElementById('editProductName').readOnly = !custom;
        document.getElementById('editProductCategory').value = override.category || product.category || 'Menu';
        document.getElementById('editProductPrice').value = String(Number(override.price ?? product.price) || '');
        document.getElementById('editProductStock').value = override.stock ?? product.stock ?? '';
        document.getElementById('editProductPrepTime').value = String(override.prepTime ?? product.prepTime ?? 0);
        document.getElementById('editProductSku').value = override.sku || product.sku || '';
        document.getElementById('editProductDescription').value = override.description ?? product.description ?? '';
        document.getElementById('editProductImage').value = override.image || product.image || '';
        document.getElementById('editProductBarcode').value = override.barcode || product.barcode || '';
        document.getElementById('editProductCost').value = String(override.cost ?? product.cost ?? '');
        document.getElementById('editProductLowStock').value = String(override.lowStockThreshold ?? product.lowStockThreshold ?? 5);
        document.getElementById('editProductLifecycle').value = override.lifecycle || product.lifecycle || 'active';
        document.getElementById('editProductAllergens').value = override.allergens || product.allergens || '';
        document.getElementById('editProductTags').value = override.tags || product.tags || '';
        document.getElementById('editProductVariants').value = Array.isArray(override.variants || product.variants)
            ? (override.variants || product.variants).map(item => `${item.name || ''} | +${item.price || 0}`).join('\n')
            : '';
        document.getElementById('editProductAddons').value = Array.isArray(override.addons || product.addons)
            ? (override.addons || product.addons).map(item => `${item.name || ''} | +${item.price || 0}`).join('\n')
            : '';
        document.getElementById('editProductNotes').value = override.notes || product.notes || '';
        document.getElementById('editProductScheduleStart').value = override.scheduleStart || product.scheduleStart || '';
        document.getElementById('editProductScheduleEnd').value = override.scheduleEnd || product.scheduleEnd || '';
        document.getElementById('editProductAvailable').checked = override.available !== false && override.deleted !== true;
        document.getElementById('editProductMessage').hidden = true;
        productEditorDirty = false;
        const savedDraft = readJSON(productDraftKey, null);
        if (savedDraft && savedDraft.key === key && savedDraft.fields && window.confirm('A locally saved draft exists for this product. Restore it?')) {
            editProductInputs.forEach(input => {
                if (!Object.prototype.hasOwnProperty.call(savedDraft.fields, input.id)) return;
                if (input.type === 'checkbox') input.checked = Boolean(savedDraft.fields[input.id]);
                else input.value = String(savedDraft.fields[input.id] ?? '');
            });
            productEditorDirty = true;
            document.getElementById('editProductMessage').textContent = 'Restored autosaved local draft.';
            document.getElementById('editProductMessage').hidden = false;
        }
        updateProductPreview();
        if (!productEditDialog.open) productEditDialog.showModal();
    }

    editProductInputs.forEach(input => {
        input.addEventListener('input', () => {
            productEditorDirty = true;
            updateProductPreview();
            try {
                localStorage.setItem(productDraftKey, JSON.stringify({
                    key: document.getElementById('editProductKey').value,
                    fields: Object.fromEntries(editProductInputs.map(field => [field.id, field.type === 'checkbox' ? field.checked : field.value]))
                }));
            } catch (error) {
                console.error('Unable to autosave the product draft:', error);
            }
        });
        input.addEventListener('change', () => {
            productEditorDirty = true;
            updateProductPreview();
        });
    });
    document.getElementById('editProductImageUpload').addEventListener('change', event => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 750 * 1024) {
            document.getElementById('editProductMessage').textContent = 'Choose an image smaller than 750 KB.';
            document.getElementById('editProductMessage').hidden = false;
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            document.getElementById('editProductImage').value = String(reader.result);
            productEditorDirty = true;
            updateProductPreview();
        };
        reader.readAsDataURL(file);
    });
    document.getElementById('productEditDialog').addEventListener('close', () => {
        if (productEditorDirty && !window.confirm('Discard unsaved product changes?')) {
            return;
        }
        localStorage.removeItem(productDraftKey);
        productEditorDirty = false;
    });
    window.addEventListener('beforeunload', event => {
        if (!productEditorDirty) return;
        event.preventValue = '';
        event.returnValue = '';
    });

    document.getElementById('saveProductEdit').addEventListener('click', () => {
        const key = document.getElementById('editProductKey').value;
        const name = document.getElementById('editProductName').value.trim();
        const category = document.getElementById('editProductCategory').value.trim();
        const price = Number(document.getElementById('editProductPrice').value);
        const costValue = document.getElementById('editProductCost').value.trim();
        const cost = costValue ? Math.max(0, Number(costValue) || 0) : null;
        const lowStockThreshold = Math.max(0, Number.parseInt(document.getElementById('editProductLowStock').value, 10) || 5);
        const parseOptionLines = value => value.split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const parts = line.split('|').map(part => part.trim());
                const match = String(parts[1] || '').replace('+', '').match(/(?:\d+(?:\.\d+)?)/);
                return { name: parts[0], price: match ? Number(match[0]) : 0 };
            })
            .filter(option => option.name);
        const scheduleStart = document.getElementById('editProductScheduleStart').value;
        const scheduleEnd = document.getElementById('editProductScheduleEnd').value;
        if (scheduleStart && scheduleEnd && new Date(scheduleEnd) <= new Date(scheduleStart)) {
            message.textContent = 'The scheduled end must be after the scheduled start.';
            message.hidden = false;
            return;
        }
        const stockValue = document.getElementById('editProductStock').value.trim();
        const stock = stockValue ? Math.max(0, Number.parseInt(stockValue, 10) || 0) : null;
        const available = document.getElementById('editProductAvailable').checked;
        [document.getElementById('editProductName'), document.getElementById('editProductCategory'), document.getElementById('editProductPrice')]
            .forEach(input => input.classList.remove('field-error'));
        if (!name || !category || !Number.isFinite(price) || price <= 0) {
            message.textContent = 'Name, category, and a price greater than zero are required.';
            message.hidden = false;
            document.querySelectorAll('#editProductName, #editProductCategory, #editProductPrice').forEach(input => {
                if (!input.value.trim() || (input.type === 'number' && Number(input.value) <= 0)) input.classList.add('field-error');
            });
            return;
        }
        if (stock === 0 && available && !window.confirm('This product has zero stock. Mark it unavailable?')) return;
        if (!saveUndoSnapshot()) return;
        const previousOverrides = localStorage.getItem(overridesKey);
        const previousCustomProducts = localStorage.getItem(customProductsKey);
        const customIndex = customProducts.findIndex(product => normalizeTitle(product.title) === key);
        if (customIndex !== -1) {
            const newKey = normalizeTitle(name);
            if (
                (newKey !== key && (
                    defaultProducts.has(newKey)
                    || customProducts.some((product, index) =>
                        index !== customIndex
                        && product.deleted !== true
                        && normalizeTitle(product.title) === newKey
                    )
                ))
                || overrideSkuConflict(document.getElementById('editProductSku').value, customIndex)
            ) {
                message.textContent = 'That product name or SKU is already used.';
                message.hidden = false;
                return;
            }
            customProducts[customIndex] = {
                ...customProducts[customIndex],
                title: name,
                category,
                description: document.getElementById('editProductDescription').value.trim(),
                price,
                stock,
                prepTime: Math.max(0, Number.parseInt(document.getElementById('editProductPrepTime').value, 10) || 0),
                sku: document.getElementById('editProductSku').value.trim(),
                image: document.getElementById('editProductImage').value.trim(),
                barcode: document.getElementById('editProductBarcode').value.trim(),
                cost,
                lowStockThreshold,
                lifecycle: document.getElementById('editProductLifecycle').value,
                allergens: document.getElementById('editProductAllergens').value.trim(),
                tags: document.getElementById('editProductTags').value.trim(),
                variants: parseOptionLines(document.getElementById('editProductVariants').value),
                addons: parseOptionLines(document.getElementById('editProductAddons').value),
                notes: document.getElementById('editProductNotes').value.trim(),
                scheduleStart,
                scheduleEnd,
                deleted: false,
                updatedAt: new Date().toISOString(),
                updatedBy: identity.name || identity.username || 'Administrator'
            };
            delete overrides[key];
        } else {
            overrides[key] = {
                ...(overrides[key] || {}),
                title: name,
                category,
                description: document.getElementById('editProductDescription').value.trim(),
                price,
                stock,
                prepTime: Math.max(0, Number.parseInt(document.getElementById('editProductPrepTime').value, 10) || 0),
                sku: document.getElementById('editProductSku').value.trim(),
                image: document.getElementById('editProductImage').value.trim(),
                barcode: document.getElementById('editProductBarcode').value.trim(),
                cost,
                lowStockThreshold,
                lifecycle: document.getElementById('editProductLifecycle').value,
                allergens: document.getElementById('editProductAllergens').value.trim(),
                tags: document.getElementById('editProductTags').value.trim(),
                variants: parseOptionLines(document.getElementById('editProductVariants').value),
                addons: parseOptionLines(document.getElementById('editProductAddons').value),
                notes: document.getElementById('editProductNotes').value.trim(),
                scheduleStart,
                scheduleEnd,
                available: stock === 0 ? false : available,
                updatedAt: new Date().toISOString(),
                updatedBy: identity.name || identity.username || 'Administrator'
            };
        }
        try {
            localStorage.setItem(overridesKey, JSON.stringify(overrides));
            localStorage.setItem(customProductsKey, JSON.stringify(customProducts));
            productEditorDirty = false;
            addAuditEntry('update', name, `Product editor saved ${money(price)}`);
            productEditDialog.close();
            renderProducts();
            window.dispatchEvent(new Event('biterush-menu-updated'));
            productMessage.textContent = `${name} updated.`;
            productMessage.hidden = false;
        } catch (error) {
            console.error('Unable to save product editor changes:', error);
            if (previousOverrides === null) localStorage.removeItem(overridesKey);
            else localStorage.setItem(overridesKey, previousOverrides);
            if (previousCustomProducts === null) localStorage.removeItem(customProductsKey);
            else localStorage.setItem(customProductsKey, previousCustomProducts);
            message.textContent = 'Product changes could not be saved.';
            message.hidden = false;
        }
    });

    function permanentlyDeleteProduct(product, key) {
        if (!window.confirm(`Permanently delete "${product.title}"? This cannot be undone.`)) return;
        if (!saveUndoSnapshot()) return;
        const previous = localStorage.getItem(customProductsKey);
        customProducts = customProducts.filter(item => normalizeTitle(item.title) !== key);
        try {
            localStorage.setItem(customProductsKey, JSON.stringify(customProducts));
            addAuditEntry('permanent delete', product.title, 'Custom product permanently deleted');
            renderProducts();
            window.dispatchEvent(new Event('biterush-menu-updated'));
            productMessage.textContent = `${product.title} permanently deleted.`;
            productMessage.hidden = false;
        } catch (error) {
            console.error('Unable to permanently delete product:', error);
            customProducts = previous ? JSON.parse(previous) : [];
            productMessage.textContent = 'The product could not be permanently deleted.';
            productMessage.hidden = false;
        }
    }

    const csvEscape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    document.getElementById('exportMenuCsv').addEventListener('click', () => {
        const products = [...defaultProducts.values(), ...customProducts]
            .filter(product => product.deleted !== true);
        const rows = [
            ['id', 'name', 'category', 'description', 'price', 'available', 'stock', 'prepTime', 'sku', 'barcode', 'cost', 'lowStockThreshold', 'lifecycle', 'allergens', 'tags', 'notes', 'scheduleStart', 'scheduleEnd', 'image'],
            ...products.map(product => {
                const key = normalizeTitle(product.title);
                const override = overrides[key] || {};
                return [
                    product.id || key,
                    override.title || product.title,
                    override.category || product.category || 'Menu',
                    override.description ?? product.description ?? '',
                    override.price ?? product.price ?? 0,
                    override.available !== false && override.deleted !== true ? 'true' : 'false',
                    override.stock ?? product.stock ?? '',
                    override.prepTime ?? product.prepTime ?? 0,
                    override.sku || product.sku || '',
                    override.barcode || product.barcode || '',
                    override.cost ?? product.cost ?? '',
                    override.lowStockThreshold ?? product.lowStockThreshold ?? 5,
                    override.lifecycle || product.lifecycle || 'active',
                    override.allergens || product.allergens || '',
                    override.tags || product.tags || '',
                    override.notes || product.notes || '',
                    override.scheduleStart || product.scheduleStart || '',
                    override.scheduleEnd || product.scheduleEnd || '',
                    override.image || product.image || ''
                ];
            })
        ];
        const blob = new Blob([rows.map(row => row.map(csvEscape).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `biterush-menu-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        addAuditEntry('export', 'menu CSV', `${products.length} products exported`);
    });

    document.getElementById('importMenuCsv').addEventListener('change', async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            if (file.size > 2 * 1024 * 1024) throw new Error('CSV file is larger than 2 MB.');
            const text = await file.text();
            const lines = text.split(/\r?\n/).filter(line => line.trim());
            const parseLine = line => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)]
                .map(match => (match[1].startsWith('"') ? match[1].slice(1, -1).replaceAll('""', '"') : match[1]));
            if (lines.length < 2) throw new Error('CSV contains no product rows.');
            const header = parseLine(lines[0]).map(value => value.trim().toLowerCase());
            const required = ['name', 'category', 'price'];
            if (!required.every(value => header.includes(value))) throw new Error('CSV must include name, category, and price columns.');
            const rowCount = lines.length - 1;
            if (!window.confirm(`Preview confirmed: ${rowCount} CSV row(s) will be imported or updated. Continue?`)) return;
            let imported = 0;
            if (!saveUndoSnapshot()) return;
            lines.slice(1).forEach(line => {
                const values = parseLine(line);
                const row = Object.fromEntries(header.map((value, index) => [value, values[index]?.trim() || '']));
                const price = Number(row.price);
                if (!row.name || !row.category || !Number.isFinite(price) || price <= 0) return;
                const key = normalizeTitle(row.name);
                if (defaultProducts.has(key)) {
                    overrides[key] = {
                        ...(overrides[key] || {}),
                        category: row.category,
                        description: row.description || '',
                        price,
                        available: String(row.available || 'true').toLowerCase() !== 'false',
                        stock: row.stock === '' ? null : Math.max(0, Number.parseInt(row.stock, 10) || 0),
                        prepTime: Math.max(0, Number.parseInt(row.preptime || row['prep time'], 10) || 0),
                        sku: row.sku || '',
                        barcode: row.barcode || '',
                        cost: row.cost === '' ? null : Math.max(0, Number(row.cost) || 0),
                        lowStockThreshold: Math.max(0, Number.parseInt(row.lowstockthreshold, 10) || 5),
                        lifecycle: row.lifecycle || 'active',
                        allergens: row.allergens || '',
                        tags: row.tags || '',
                        notes: row.notes || '',
                        scheduleStart: row.schedulestart || '',
                        scheduleEnd: row.scheduleend || '',
                        image: row.image || '',
                        updatedAt: new Date().toISOString()
                    };
                } else {
                    const existing = customProducts.findIndex(product => normalizeTitle(product.title) === key);
                    const product = {
                        id: row.id || (window.crypto?.randomUUID ? window.crypto.randomUUID() : `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                        title: row.name,
                        category: row.category,
                        description: row.description || '',
                        price,
                        stock: row.stock === '' ? null : Math.max(0, Number.parseInt(row.stock, 10) || 0),
                        prepTime: Math.max(0, Number.parseInt(row.preptime || row['prep time'], 10) || 0),
                        sku: row.sku || '',
                        barcode: row.barcode || '',
                        cost: row.cost === '' ? null : Math.max(0, Number(row.cost) || 0),
                        lowStockThreshold: Math.max(0, Number.parseInt(row.lowstockthreshold, 10) || 5),
                        lifecycle: row.lifecycle || 'active',
                        allergens: row.allergens || '',
                        tags: row.tags || '',
                        notes: row.notes || '',
                        scheduleStart: row.schedulestart || '',
                        scheduleEnd: row.scheduleend || '',
                        image: row.image || '',
                        featured: true,
                        deleted: false,
                        updatedAt: new Date().toISOString()
                    };
                    if (existing === -1) customProducts.push(product);
                    else customProducts[existing] = { ...customProducts[existing], ...product, createdAt: customProducts[existing].createdAt };
                }
                imported += 1;
            });
            localStorage.setItem(overridesKey, JSON.stringify(overrides));
            localStorage.setItem(customProductsKey, JSON.stringify(customProducts));
            addAuditEntry('import', 'menu CSV', `${imported} products imported`);
            renderProducts();
            window.dispatchEvent(new Event('biterush-menu-updated'));
            productMessage.textContent = `${imported} menu product(s) imported.`;
            productMessage.hidden = false;
        } catch (error) {
            console.error('Unable to import menu CSV:', error);
            productMessage.textContent = error.message || 'The menu CSV could not be imported.';
            productMessage.hidden = false;
        } finally {
            event.target.value = '';
        }
    });

    document.getElementById('printMenuButton').addEventListener('click', () => {
        const printable = [...defaultProducts.values(), ...customProducts]
            .filter(product => product.deleted !== true)
            .map(product => {
                const key = normalizeTitle(product.title);
                const override = overrides[key] || {};
                return {
                    name: override.title || product.title,
                    category: override.category || product.category || 'Menu',
                    description: override.description ?? product.description ?? '',
                    price: override.price ?? product.price ?? 0
                };
            });
        const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[character]);
        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
            productMessage.textContent = 'Allow pop-ups to print the menu.';
            productMessage.hidden = false;
            return;
        }
        printWindow.document.write(`<!doctype html><html><head><title>BiteRush Menu</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#222}article{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:12px 0}small{color:#666}.price{font-weight:bold}</style></head><body><h1>BiteRush Menu</h1>${printable.map(item => `<article><div><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.category)} — ${escapeHtml(item.description)}</small></div><span class="price">₱${Number(item.price).toFixed(2)}</span></article>`).join('')}</body></html>`);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        addAuditEntry('export', 'print menu', `${printable.length} products printed`);
    });

    document.getElementById('addProductForm').addEventListener('submit', event => {
        event.preventDefault();
        const nameInput = document.getElementById('newProductName');
        const categoryInput = document.getElementById('newProductCategory');
        const priceInput = document.getElementById('newProductPrice');
        const descriptionInput = document.getElementById('newProductDescription');
        const imageInput = document.getElementById('newProductImage');
        const stockInput = document.getElementById('newProductStock');
        const prepTimeInput = document.getElementById('newProductPrepTime');
        const skuInput = document.getElementById('newProductSku');
        const title = nameInput.value.trim();
        const category = categoryInput.value.trim();
        const price = Number(priceInput.value);
        const key = normalizeTitle(title);
        const stock = stockInput.value.trim()
            ? Math.max(0, Number.parseInt(stockInput.value, 10) || 0)
            : null;
        const prepTime = Math.max(0, Number.parseInt(prepTimeInput.value, 10) || 0);
        const sku = skuInput.value.trim();
        if (!title || !category || !priceInput.value.trim() || !Number.isFinite(price) || price <= 0) {
            productMessage.textContent = 'Dish name, category, and a price greater than zero are required.';
            productMessage.hidden = false;
            return;
        }
        if (sku && (
            customProducts.some(product => String(product.sku || '').toLocaleLowerCase() === sku.toLocaleLowerCase())
            || Object.values(overrides).some(override => String(override?.sku || '').toLocaleLowerCase() === sku.toLocaleLowerCase())
        )) {
            productMessage.textContent = 'A dish with that SKU already exists.';
            productMessage.hidden = false;
            skuInput.focus();
            return;
        }
        if (defaultProducts.has(key) || customProducts.some(product =>
            product.deleted !== true && normalizeTitle(product.title) === key
        )) {
            productMessage.textContent = 'A dish with that name already exists.';
            productMessage.hidden = false;
            nameInput.focus();
            return;
        }
        let image = imageInput.value.trim();
        if (image) {
            try {
                const parsedImage = new URL(image, window.location.href);
                if (!['http:', 'https:', 'file:'].includes(parsedImage.protocol)) throw new Error('Unsupported image URL protocol.');
                image = parsedImage.href;
            } catch (error) {
                productMessage.textContent = 'Enter a valid HTTP, HTTPS, or local image URL.';
                productMessage.hidden = false;
                imageInput.focus();
                return;
            }
        } else {
            image = new URL('../BiteRushHomePage/HomePagePics/burger.png', window.location.href).href;
        }
        if (!saveUndoSnapshot()) return;
        customProducts.push({
            id: window.crypto?.randomUUID
                ? window.crypto.randomUUID()
                : `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title,
            price,
            category,
            description: descriptionInput.value.trim(),
            image,
            stock,
            prepTime,
            sku,
            featured: true,
            deleted: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: identity.name || identity.username || 'Administrator'
        });
        try {
            localStorage.setItem(customProductsKey, JSON.stringify(customProducts));
            productMessage.textContent = `${title} added to the featured menu on this browser.`;
            productMessage.hidden = false;
            addAuditEntry('create', title, `Price ${money(price)}, stock ${stock === null ? 'unlimited' : stock}, SKU ${sku || 'none'}`);
            event.currentTarget.reset();
            renderProducts();
            window.dispatchEvent(new Event('biterush-menu-updated'));
        } catch (error) {
            customProducts.pop();
            console.error('Unable to add custom product:', error);
            productMessage.textContent = 'The dish could not be saved in this browser.';
            productMessage.hidden = false;
            try {
                localStorage.removeItem(undoKey);
            } catch (cleanupError) {
                console.error('Unable to clear unused menu undo snapshot:', cleanupError);
            }
            updateUndoButton();
        }
    });

    function saveFeedbackChanges(order) {
        try {
            const history = readJSON(ordersKey, []);
            if (Array.isArray(history)) {
                const index = history.findIndex(entry => entry.id === order.id);
                if (index !== -1) history[index].feedback = order.feedback;
                localStorage.setItem(ordersKey, JSON.stringify(history));
            }
            const latest = readJSON(receiptKey, null);
            if (latest && latest.id === order.id) {
                latest.feedback = order.feedback;
                localStorage.setItem(receiptKey, JSON.stringify(latest));
            }
            orders = getOrders();
        } catch (error) {
            console.error('Unable to save feedback changes:', error);
            window.alert('The feedback change could not be saved.');
        }
    }

    function renderAuditLog() {
        const container = document.getElementById('auditLog');
        if (!container) return;
        container.replaceChildren();
        const query = String(document.getElementById('auditSearch')?.value || '').trim().toLocaleLowerCase();
        const entries = getAuditEntries().filter(entry => {
            if (!query) return true;
            return [entry.actor, entry.role, entry.action, entry.entity, entry.details]
                .some(value => String(value || '').toLocaleLowerCase().includes(query));
        });
        if (!entries.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-panel';
            empty.textContent = 'No administrative changes recorded yet.';
            container.appendChild(empty);
            return;
        }
        entries.slice(0, 100).forEach(entry => {
            const row = document.createElement('div');
            row.className = 'audit-entry';
            const time = document.createElement('time');
            time.textContent = entry.at ? new Date(entry.at).toLocaleString() : 'Unknown time';
            const action = document.createElement('strong');
            action.textContent = entry.action || 'change';
            const detail = document.createElement('span');
            detail.textContent = `${entry.actor || 'Unknown'} · ${entry.entity || ''}${entry.details ? ` · ${entry.details}` : ''}`;
            row.append(time, action, detail);
            container.appendChild(row);
        });
    }

    document.getElementById('exportAuditButton')?.addEventListener('click', () => {
        const query = String(document.getElementById('auditSearch')?.value || '').trim().toLocaleLowerCase();
        const entries = getAuditEntries().filter(entry => {
            if (!query) return true;
            return [entry.actor, entry.role, entry.action, entry.entity, entry.details]
                .some(value => String(value || '').toLocaleLowerCase().includes(query));
        });
        const csv = [
            ['time', 'actor', 'role', 'action', 'entity', 'details'],
            ...entries.map(entry => [entry.at, entry.actor, entry.role, entry.action, entry.entity, entry.details])
        ].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `biterush-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    document.getElementById('auditSearch')?.addEventListener('input', renderAuditLog);

    function renderFeedback() {
        const reviews = orders
            .filter(order => order.feedback && typeof order.feedback === 'object')
            .map(order => ({ order, feedback: order.feedback }));
        const filter = document.getElementById('feedbackFilter').value;
        const sort = document.getElementById('feedbackSort').value;
        const search = document.getElementById('feedbackSearch').value.trim().toLocaleLowerCase();
        const rating = review => {
            const values = [Number(review.feedback.foodRating), Number(review.feedback.deliveryRating)]
                .filter(value => Number.isFinite(value) && value >= 1 && value <= 5);
            return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
        };
        const visibleReviews = reviews
            .filter(review => filter !== 'low' || (rating(review) > 0 && rating(review) <= 2))
            .filter(review => !search || `${review.order.id} ${review.feedback.comment || ''}`
                .toLocaleLowerCase().includes(search))
            .sort((first, second) => sort === 'lowest'
                ? rating(first) - rating(second)
                : new Date(second.feedback.submittedAt || second.order.createdAt || 0)
                    - new Date(first.feedback.submittedAt || first.order.createdAt || 0));
        document.getElementById('feedbackCount').textContent =
            `${visibleReviews.length} ${visibleReviews.length === 1 ? 'review' : 'reviews'}`;
        const list = document.getElementById('feedbackList');
        list.replaceChildren();
        if (!visibleReviews.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-panel';
            empty.textContent = reviews.length
                ? 'No feedback matches these filters.'
                : 'No customer feedback has been submitted in this browser yet.';
            list.appendChild(empty);
            return;
        }
        visibleReviews.forEach(({ order, feedback }) => {
            const card = document.createElement('article');
            card.className = 'review-card';
            const header = document.createElement('div');
            header.className = 'review-heading';
            const orderNumber = document.createElement('strong');
            orderNumber.textContent = `Order #${order.id}`;
            const date = document.createElement('time');
            date.textContent = feedback.submittedAt
                ? new Date(feedback.submittedAt).toLocaleDateString()
                : 'Date unavailable';
            header.append(orderNumber, date);
            const ratings = document.createElement('p');
            ratings.className = 'review-ratings';
            ratings.textContent = `Food: ${feedback.foodRating || '—'}/5 · Delivery: ${feedback.deliveryRating || '—'}/5`;
            const comment = document.createElement('p');
            comment.className = 'review-comment';
            comment.textContent = feedback.comment || 'No written comment.';
            if (feedback.hidden) card.classList.add('review-hidden');
            const response = document.createElement('textarea');
            response.className = 'review-response';
            response.maxLength = 500;
            response.placeholder = 'Write a response to this review';
            response.value = feedback.adminResponse || '';
            const actions = document.createElement('div');
            actions.className = 'review-actions';
            const saveResponse = document.createElement('button');
            saveResponse.type = 'button';
            saveResponse.className = 'table-action-button';
            saveResponse.textContent = 'Save response';
            saveResponse.addEventListener('click', () => {
                feedback.adminResponse = response.value.trim();
                feedback.responseAt = new Date().toISOString();
                saveFeedbackChanges(order);
                addAuditEntry('respond', `review ${order.id}`, 'Customer review response saved');
                renderFeedback();
            });
            const hide = document.createElement('button');
            hide.type = 'button';
            hide.className = 'table-action-button';
            hide.textContent = feedback.hidden ? 'Show review' : 'Hide review';
            hide.addEventListener('click', () => {
                feedback.hidden = !feedback.hidden;
                saveFeedbackChanges(order);
                addAuditEntry(feedback.hidden ? 'hide' : 'show', `review ${order.id}`, 'Review visibility changed');
                renderFeedback();
            });
            actions.append(saveResponse, hide);
            card.append(header, ratings, comment, response, actions);
            list.appendChild(card);
        });
    }

    document.getElementById('feedbackFilter').addEventListener('change', renderFeedback);
    document.getElementById('feedbackSort').addEventListener('change', renderFeedback);
    document.getElementById('feedbackSearch').addEventListener('input', renderFeedback);
    const sessionTimeoutMinutes = 30;
    let sessionActivityAt = Date.now();
    const sessionTimeoutStatus = document.getElementById('sessionTimeoutStatus');
    ['click', 'keydown', 'mousemove', 'touchstart'].forEach(eventName => {
        window.addEventListener(eventName, () => {
            sessionActivityAt = Date.now();
        }, { passive: true });
    });
    window.setInterval(() => {
        const idleMinutes = (Date.now() - sessionActivityAt) / 60000;
        if (!sessionTimeoutStatus) return;
        if (idleMinutes >= sessionTimeoutMinutes) {
            localStorage.removeItem(sessionKey);
            localStorage.removeItem(adminIdentityKey);
            window.location.replace('login.html');
        } else if (idleMinutes >= sessionTimeoutMinutes - 5) {
            sessionTimeoutStatus.textContent = 'Session expires soon';
        } else {
            sessionTimeoutStatus.textContent = 'Session active';
        }
    }, 30000);

    const autoSnapshotKey = 'biterush_auto_backup';
    const lastAutoSnapshot = Number(localStorage.getItem('biterush_auto_backup_at') || 0);
    if (Date.now() - lastAutoSnapshot > 24 * 60 * 60 * 1000) {
        const snapshot = Object.fromEntries([
            ordersKey, receiptKey, overridesKey, customProductsKey, auditKey,
            'biterush_cart', 'biterush_favorites', 'biterush_delivery', 'biterush_voucher'
        ].map(key => [key, readJSON(key, key === ordersKey || key === customProductsKey || key === auditKey ? [] : key === receiptKey ? null : {})]));
        try {
            localStorage.setItem(autoSnapshotKey, JSON.stringify({ schemaVersion: 3, exportedAt: new Date().toISOString(), data: snapshot }));
            localStorage.setItem('biterush_auto_backup_at', String(Date.now()));
        } catch (error) {
            console.error('Unable to create automatic local backup snapshot:', error);
        }
    }

    if ('BroadcastChannel' in window) {
        const biteChannel = new BroadcastChannel('biterush-menu-sync');
        window.addEventListener('biterush-menu-updated', () => {
            biteChannel.postMessage({ type: 'menu-updated', at: new Date().toISOString() });
        });
        biteChannel.addEventListener('message', event => {
            if (event.data?.type !== 'menu-updated') return;
            overrides = readJSON(overridesKey, {});
            customProducts = readJSON(customProductsKey, []);
            renderProducts();
        });
    }

    document.getElementById('adminLogout').addEventListener('click', () => {
        localStorage.removeItem(sessionKey);
        localStorage.removeItem(adminIdentityKey);
        window.location.href = 'login.html';
    });
    window.addEventListener('storage', event => {
        if ([ordersKey, receiptKey, overridesKey, customProductsKey].includes(event.key)) {
            orders = getOrders();
            if (event.key === ordersKey || event.key === receiptKey) {
                const newOrders = orders.filter(order => !knownOrderIds.has(order.id));
                newOrders.forEach(order => knownOrderIds.add(order.id));
                if (newOrders.length) {
                    document.getElementById('newOrderNotice').textContent =
                        `${newOrders.length} new order${newOrders.length === 1 ? '' : 's'} received.`;
                    document.getElementById('newOrderNotice').hidden = false;
                }
            }
            renderMetrics();
            renderOrderList();
            renderOrderDetail();
            if (event.key === ordersKey || event.key === receiptKey) {
                renderSalesReport();
            }
            if (event.key === overridesKey || event.key === customProductsKey) {
                overrides = readJSON(overridesKey, {});
                customProducts = readJSON(customProductsKey, []);
                renderProducts();
            }
            renderFeedback();
        }
    });

    renderMetrics();
    renderOrderList();
    renderOrderDetail();
    renderSalesReport();
    renderProducts();
    renderFeedback();
    renderAuditLog();
}());
