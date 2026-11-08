(function () {
    const receiptKey = 'biterush_last_order';
    const ordersKey = 'biterush_orders';
    const params = new URLSearchParams(window.location.search);
    const requestedOrder = params.get('order');
    const requestedFood = String(params.get('food') || '').trim();
    const requestedPath = normalizePath(params.get('path') || '');
    const form = document.getElementById('feedbackForm');
    const unavailable = document.getElementById('feedbackUnavailable');
    const unavailableMessage = document.getElementById('feedbackUnavailableMessage');
    const success = document.getElementById('feedbackSuccess');
    const orderFeedback = document.querySelector('.order-feedback');
    const errorMessage = document.getElementById('formError');
    const reviewError = document.getElementById('reviewError');
    const foodSelect = document.getElementById('foodItemSelect');
    const foodItemGroup = document.getElementById('foodItemGroup');
    const deliveryRatingGroup = document.getElementById('deliveryRatingGroup');
    const reviewList = document.getElementById('reviewList');
    const reviewSort = document.getElementById('reviewSort');
    let receipt = null;
    let eligibleItems = [];
    let activeRating = null;

    function normalizeFood(value) {
        return String(value || '').trim().toLocaleLowerCase();
    }

    function normalizePath(value) {
        const path = String(value || '').trim();
        if (!path) return '';
        try {
            if (!path.startsWith('/') && !path.includes('/') && !/^(https?|file):/i.test(path)) {
                return '';
            }
            return new URL(path, window.location.href).pathname;
        } catch (error) {
            return '';
        }
    }

    function validRating(value) {
        const rating = Number(value);
        return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
    }

    function setReviewError(message) {
        reviewError.textContent = message;
        reviewError.hidden = !message;
    }

    function loadOrders() {
        try {
            const history = JSON.parse(localStorage.getItem(ordersKey) || '[]');
            if (!Array.isArray(history)) {
                throw new Error('Saved order history is not a valid list.');
            }
            const orders = history.filter(order => order && typeof order === 'object');
            const latestReceipt = JSON.parse(localStorage.getItem(receiptKey) || 'null');
            if (latestReceipt && typeof latestReceipt === 'object') {
                const existingIndex = orders.findIndex(order => order.id && order.id === latestReceipt.id);
                if (existingIndex === -1) orders.unshift(latestReceipt);
                else orders[existingIndex] = { ...orders[existingIndex], ...latestReceipt };
            }
            setReviewError('');
            return orders;
        } catch (error) {
            console.error('Unable to read customer food reviews:', error);
            setReviewError('Ratings could not be loaded from saved order history.');
            return [];
        }
    }

    function getOrderReviews(order) {
        if (Array.isArray(order.productReviews) && order.productReviews.length) {
            return order.productReviews
                .filter(review => review && typeof review === 'object')
                .map(review => ({
                    foodItem: String(review.foodItem || ''),
                    foodItemPath: normalizePath(review.foodItemPath),
                    foodRating: validRating(review.foodRating),
                    comment: String(review.comment || '').trim(),
                    submittedAt: review.submittedAt || order.updatedAt || order.createdAt,
                    orderId: order.id
                }))
                .filter(review => review.foodItem && review.foodRating);
        }

        const feedback = order.feedback;
        if (!feedback || typeof feedback !== 'object') return [];
        const foodRating = validRating(feedback.foodRating);
        if (!foodRating) return [];

        const foodItem = String(feedback.foodItem || feedback.productTitle || '').trim();
        const foodItemPath = normalizePath(feedback.foodItemPath || feedback.productPath);
        const baseReview = {
            foodItem,
            foodItemPath,
            foodRating,
            comment: String(feedback.comment || '').trim(),
            submittedAt: feedback.submittedAt || order.updatedAt || order.createdAt,
            orderId: order.id
        };
        if (foodItem) return [baseReview];

        const items = (Array.isArray(order.items) ? order.items : [])
            .filter(item => item && (item.reviewTitle || item.title));
        if (items.length !== 1) return [];
        return [{
            ...baseReview,
            foodItem: String(items[0].reviewTitle || items[0].title),
            foodItemPath: normalizePath(items[0].link || items[0].key)
        }];
    }

    function matchesRequestedFood(review) {
        if (requestedPath && review.foodItemPath) {
            return review.foodItemPath === requestedPath;
        }
        return normalizeFood(review.foodItem) === normalizeFood(requestedFood);
    }

    function reviewsForFood() {
        return loadOrders()
            .filter(order => order.status === 'delivered')
            .flatMap(getOrderReviews)
            .filter(matchesRequestedFood);
    }

    function makeStars(rating, className) {
        const stars = document.createElement('span');
        stars.className = className;
        stars.setAttribute('aria-label', `${rating} out of 5 stars`);
        for (let value = 1; value <= 5; value += 1) {
            const star = document.createElement('span');
            star.textContent = '★';
            if (value <= Math.round(rating)) star.classList.add('is-filled');
            stars.appendChild(star);
        }
        return stars;
    }

    function displayDate(value) {
        const date = value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime())
            ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : 'Date unavailable';
    }

    function addReviewCard(review) {
        const article = document.createElement('article');
        article.className = 'review-item';

        const header = document.createElement('div');
        header.className = 'review-item-header';
        const identity = document.createElement('div');
        identity.className = 'review-identity';

        const avatar = document.createElement('span');
        avatar.className = 'review-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = 'B';

        const customer = document.createElement('div');
        customer.className = 'review-customer';
        const name = document.createElement('strong');
        name.textContent = 'BiteRush customer';
        const verified = document.createElement('span');
        verified.className = 'verified-purchase';
        verified.textContent = '✓ Verified order';
        customer.append(name, verified);
        identity.append(avatar, customer);

        const date = document.createElement('time');
        date.className = 'review-date';
        date.textContent = displayDate(review.submittedAt);
        if (review.submittedAt) date.dateTime = review.submittedAt;
        header.append(identity, date);

        const rating = document.createElement('div');
        rating.className = 'review-rating';
        rating.appendChild(makeStars(review.foodRating, 'review-stars'));
        const ratingText = document.createElement('span');
        ratingText.textContent = `${review.foodRating} out of 5`;
        rating.appendChild(ratingText);

        const comment = document.createElement('p');
        comment.className = 'review-comment';
        comment.textContent = review.comment || 'Rated this food.';
        article.append(header, rating, comment);
        reviewList.appendChild(article);
    }

    function renderRatingBreakdown(reviews) {
        const breakdown = document.getElementById('ratingBreakdown');
        breakdown.replaceChildren();
        for (let rating = 5; rating >= 1; rating -= 1) {
            const count = reviews.filter(review => review.foodRating === rating).length;
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'rating-breakdown-row';
            row.dataset.rating = String(rating);
            row.setAttribute('aria-label', `Show ${rating}-star reviews, ${count} ratings`);
            row.setAttribute('aria-pressed', String(activeRating === rating));
            if (activeRating === rating) row.classList.add('is-active');

            const label = document.createElement('span');
            label.className = 'breakdown-label';
            label.textContent = `${rating} ★`;
            const track = document.createElement('span');
            track.className = 'breakdown-track';
            track.setAttribute('aria-hidden', 'true');
            const fill = document.createElement('span');
            fill.className = 'breakdown-fill';
            fill.style.width = `${reviews.length ? (count / reviews.length) * 100 : 0}%`;
            track.appendChild(fill);
            const number = document.createElement('span');
            number.className = 'breakdown-count';
            number.textContent = String(count);
            row.append(label, track, number);
            row.addEventListener('click', () => {
                activeRating = activeRating === rating ? null : rating;
                renderReviews();
            });
            breakdown.appendChild(row);
        }
    }

    function renderReviews() {
        const allReviews = reviewsForFood();
        const average = allReviews.length
            ? allReviews.reduce((sum, review) => sum + review.foodRating, 0) / allReviews.length
            : 0;
        document.getElementById('averageRating').textContent = average.toFixed(1);
        const averageStars = makeStars(average, 'summary-stars');
        averageStars.id = 'averageStars';
        document.getElementById('averageStars').replaceWith(averageStars);
        document.getElementById('reviewCount').textContent =
            `${allReviews.length} ${allReviews.length === 1 ? 'rating' : 'ratings'}`;
        renderRatingBreakdown(allReviews);

        const shownReviews = allReviews.filter(review => !activeRating || review.foodRating === activeRating);
        const sortOrder = reviewSort.value;
        shownReviews.sort((left, right) => {
            if (sortOrder === 'highest') return right.foodRating - left.foodRating;
            if (sortOrder === 'lowest') return left.foodRating - right.foodRating;
            return new Date(right.submittedAt || 0).getTime() - new Date(left.submittedAt || 0).getTime();
        });

        reviewList.replaceChildren();
        shownReviews.forEach(addReviewCard);
        const noReviews = document.getElementById('noReviews');
        noReviews.hidden = shownReviews.length > 0;
        noReviews.textContent = activeRating
            ? `No ${activeRating}-star reviews for this food yet.`
            : 'No ratings yet for this food. Be the first to review it after a delivered order.';

        const filterStatus = document.getElementById('reviewFilterStatus');
        filterStatus.hidden = !activeRating;
        document.getElementById('reviewFilterLabel').textContent =
            activeRating ? `Showing ${activeRating}-star reviews` : '';
    }

    function itemPath(item) {
        return normalizePath(item.link || String(item.key || '').split('|')[0]);
    }

    function itemMatchesFood(item, title, path) {
        if (!item) return false;
        const storedPath = itemPath(item);
        if (path && storedPath) return path === storedPath;
        return normalizeFood(item.reviewTitle || item.title) === normalizeFood(title);
    }

    function sameProductReview(review, item) {
        const storedPath = itemPath(item);
        if (storedPath && review.foodItemPath) return storedPath === review.foodItemPath;
        return normalizeFood(review.foodItem) === normalizeFood(item.reviewTitle || item.title);
    }

    function uniqueItems(items) {
        const seen = new Set();
        return items.filter(item => {
            const key = `${normalizeFood(item.reviewTitle || item.title)}|${itemPath(item)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function configureFeedbackForm() {
        const orders = loadOrders();
        let latestReceipt = null;
        try {
            latestReceipt = JSON.parse(localStorage.getItem(receiptKey) || 'null');
        } catch (error) {
            console.error('Unable to read order for feedback:', error);
            unavailableMessage.textContent = 'Your saved order could not be read. Please try again later.';
            unavailable.hidden = false;
            orderFeedback.hidden = Boolean(requestedFood);
            return;
        }

        const orderById = requestedOrder
            ? orders.find(order => order.id === requestedOrder)
            : null;
        if (requestedOrder) {
            receipt = orderById || (latestReceipt && latestReceipt.id === requestedOrder
                ? latestReceipt
                : null);
        } else if (requestedFood) {
            const matchingOrders = orders
                .filter(order => order.status === 'delivered'
                    && Array.isArray(order.items)
                    && order.items.some(item => itemMatchesFood(item, requestedFood, requestedPath)))
                .sort((left, right) =>
                    new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
            receipt = matchingOrders.find(order => {
                const matchingItems = uniqueItems(order.items.filter(item =>
                    itemMatchesFood(item, requestedFood, requestedPath)));
                const savedReviews = getOrderReviews(order);
                return matchingItems.some(item =>
                    !savedReviews.some(review => sameProductReview(review, item)));
            }) || matchingOrders[0] || null;
        } else {
            receipt = latestReceipt;
        }

        const validOrder = receipt
            && Array.isArray(receipt.items)
            && receipt.items.length > 0
            && receipt.status === 'delivered'
            && (!requestedOrder || requestedOrder === receipt.id);
        if (!validOrder) {
            orderFeedback.hidden = Boolean(requestedFood);
            unavailable.hidden = false;
            form.hidden = true;
            return;
        }

        document.getElementById('orderNumber').textContent = `Order #${receipt.id || '—'}`;
        const matchingItems = receipt.items.filter(item =>
            itemMatchesFood(item, requestedFood, requestedPath));
        eligibleItems = uniqueItems(requestedFood ? matchingItems : receipt.items);
        if (requestedFood && eligibleItems.length === 0) {
            orderFeedback.hidden = true;
            unavailableMessage.textContent = 'This delivered order did not include this food, so it cannot be rated from this order.';
            unavailable.hidden = false;
            form.hidden = true;
            return;
        }
        orderFeedback.hidden = false;

        const allOrderReviews = getOrderReviews(receipt);
        const alreadyReviewed = requestedFood && eligibleItems.some(item =>
            allOrderReviews.some(review => sameProductReview(review, item)));
        if (alreadyReviewed) {
            form.hidden = true;
            success.hidden = false;
            document.getElementById('feedbackSuccessMessage').textContent =
                'Your rating for this delivered order has already been saved.';
            return;
        }

        if (!requestedFood) {
            eligibleItems = eligibleItems.filter(item =>
                !allOrderReviews.some(review => sameProductReview(review, item)));
        }
        if (!eligibleItems.length) {
            form.hidden = true;
            success.hidden = false;
            document.getElementById('feedbackSuccessMessage').textContent =
                'Your ratings for this delivered order have already been saved.';
            return;
        }

        foodSelect.replaceChildren();
        eligibleItems.forEach((item, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = item.reviewTitle || item.title;
            foodSelect.appendChild(option);
        });
        foodItemGroup.hidden = eligibleItems.length <= 1 || Boolean(requestedFood);
        foodSelect.required = eligibleItems.length > 1 && !requestedFood;

        unavailable.hidden = true;
        form.hidden = false;
        success.hidden = true;
        if (receipt.feedback && validRating(receipt.feedback.deliveryRating)) {
            deliveryRatingGroup.hidden = true;
            deliveryRatingGroup.querySelectorAll('input').forEach(input => {
                input.required = false;
            });
        }
    }

    function renderPage() {
        const productReviews = document.getElementById('productReviews');
        productReviews.hidden = !requestedFood;
        orderFeedback.hidden = Boolean(requestedFood);
        if (requestedFood) {
            document.getElementById('reviewFoodName').textContent = requestedFood;
            document.getElementById('pageTitle').hidden = true;
            document.getElementById('feedbackEyebrow').textContent = 'YOUR FEEDBACK MATTERS';
            document.title = `Ratings for ${requestedFood} - BiteRush`;
            if (requestedPath) document.getElementById('backLink').href = requestedPath;
            renderReviews();
        }
        configureFeedbackForm();
    }

    document.getElementById('clearRatingFilter').addEventListener('click', () => {
        activeRating = null;
        renderReviews();
    });
    reviewSort.addEventListener('change', renderReviews);

    document.getElementById('feedbackComment').addEventListener('input', event => {
        document.getElementById('characterCount').textContent = event.target.value.length;
    });

    form.addEventListener('submit', event => {
        event.preventDefault();
        errorMessage.hidden = true;
        if (!form.reportValidity()) return;

        const formData = new FormData(form);
        const itemIndex = Number(formData.get('foodItem') || 0);
        const reviewedItem = eligibleItems[itemIndex];
        const foodRating = validRating(formData.get('foodRating'));
        const deliveryRating = validRating(formData.get('deliveryRating'))
            || validRating(receipt && receipt.feedback && receipt.feedback.deliveryRating);
        if (!reviewedItem || !foodRating || !deliveryRating) {
            errorMessage.textContent = 'Choose a food and rating before submitting.';
            errorMessage.hidden = false;
            return;
        }

        const submittedAt = new Date().toISOString();
        const foodItemPath = itemPath(reviewedItem);
        const productReview = {
            foodItem: String(reviewedItem.reviewTitle || reviewedItem.title),
            foodItemPath,
            foodRating,
            comment: String(formData.get('comment') || '').trim(),
            submittedAt
        };

        try {
            let current = null;
            const history = JSON.parse(localStorage.getItem(ordersKey) || '[]');
            if (!Array.isArray(history)) {
                throw new Error('Saved order history is not a valid list.');
            }
            current = history.find(order => order && order.id === receipt.id) || null;
            const latest = JSON.parse(localStorage.getItem(receiptKey) || 'null');
            if (latest && latest.id === receipt.id) {
                current = { ...(current || {}), ...latest };
            }
            if (!current || current.id !== receipt.id || current.status !== 'delivered') {
                throw new Error('This order is no longer available for feedback.');
            }

            const previousProductReviews = getOrderReviews(current).map(review => ({
                foodItem: review.foodItem,
                foodItemPath: review.foodItemPath,
                foodRating: review.foodRating,
                comment: review.comment,
                submittedAt: review.submittedAt
            }));
            const existingIndex = previousProductReviews.findIndex(review =>
                sameProductReview(review, reviewedItem));
            if (existingIndex === -1) previousProductReviews.push(productReview);
            else previousProductReviews[existingIndex] = productReview;

            current.productReviews = previousProductReviews;
            current.feedback = {
                ...(current.feedback && typeof current.feedback === 'object' ? current.feedback : {}),
                foodRating,
                deliveryRating,
                comment: productReview.comment,
                foodItem: productReview.foodItem,
                foodItemPath,
                submittedAt
            };

            const previousStorage = Object.fromEntries(
                [ordersKey, receiptKey].map(key => [key, localStorage.getItem(key)])
            );
            try {
                const orderIndex = history.findIndex(order => order && order.id === current.id);
                if (orderIndex === -1) history.unshift(current);
                else history[orderIndex] = { ...history[orderIndex], ...current };
                localStorage.setItem(ordersKey, JSON.stringify(history));
                if (!latest || latest.id === current.id) {
                    localStorage.setItem(receiptKey, JSON.stringify(current));
                }
            } catch (error) {
                Object.entries(previousStorage).forEach(([key, value]) => {
                    try {
                        if (value === null) localStorage.removeItem(key);
                        else localStorage.setItem(key, value);
                    } catch (restoreError) {
                        console.error(`Unable to restore ${key} after feedback save failed:`, restoreError);
                    }
                });
                throw error;
            }

            receipt = current;
            if (!requestedFood) {
                form.reset();
                document.getElementById('characterCount').textContent = '0';
                configureFeedbackForm();
            } else {
                form.hidden = true;
                success.hidden = false;
                document.getElementById('feedbackSuccessMessage').textContent =
                    'Your rating has been added to this food’s customer reviews.';
            }
            if (requestedFood) renderReviews();
        } catch (error) {
            console.error('Unable to save order feedback:', error);
            errorMessage.textContent = error.message || 'Could not save your feedback. Please try again.';
            errorMessage.hidden = false;
        }
    });

    renderPage();
}());
