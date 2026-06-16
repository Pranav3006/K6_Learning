// =============================================================
// Exercise 2: Load Profiles with Multiple Executors & Scenarios
// Concepts: scenarios, ramping-vus, constant-vus,
//           constant-arrival-rate, per-scenario thresholds,
//           startTime, tags
//
// APIs Covered (ALL endpoints):
//   Auth    : POST /auth/register, POST /auth/login
//   Books   : GET /books, POST /books, GET /books/{id},
//             PUT /books/{id}, DELETE /books/{id}
//   Orders  : POST /orders, GET /orders
//   Reviews : POST /reviews, GET /reviews
//   Utility : GET /slow
// =============================================================

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics to track performance of different user flows
const orderCreationTime = new Trend('order_creation_time', true);
const OrderSuccessRate = new Rate('order_success_rate');
const reviewCreationTime = new Trend('review_creation_time', true);
const reviewSuccessRate = new Rate('review_success_rate');

const BASE_URL = 'https://k6-bookstore-api.onrender.com';

// ─────────────────────────────────────────────────────────────
// OPTIONS: 3 scenarios with different executor types
//
// Timeline:
//   0s   → smoke_test starts        (30s, 1 VU)
//   35s  → load_test starts         (~3m30s, ramping-vus)
//   4m15s→ read_heavy_test starts   (1m, constant-arrival-rate)
// ─────────────────────────────────────────────────────────────

export const options = {
    scenarios: {
        // ── SCENARIO 1: Smoke Test ──────────────────────────────
        // Purpose : Sanity check — is anything broken?
        // Executor: constant-vus (simplest, just 1 VU)
        // Covers  : health, browse, view, slow endpoint

        smoke_test: {
            executor: 'constant-vus',
            vus: 1,
            duration: '30s',
            tags: { scenario: 'smoke' },
            startTime: '0s',
            exec: 'smokeFlow'
        },

        // ── SCENARIO 2: Load Test ───────────────────────────────
        // Purpose : Gradual ramp — simulate real traffic growth
        // Executor: ramping-vus (stages control VU count over time)
        // Covers  : full flow — browse, create book, order, review,
        //           update book, delete book

        load_test: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 2 }, // ramp up
                { duration: '1m', target: 2 }, // hold
                { duration: '30s', target: 3 }, // ramp up more
                { duration: '1m', target: 3 }, // hold
                { duration: '20s', target: 0 } // ramp down
            ],
            tags: { scenario: 'load' },
            startTime: '40s',
            exec: 'fullFlow',
        },

        // ── SCENARIO 3: Arrival Rate Test ──────────────────────
        // Purpose : Fixed RPS — validate read-heavy SLA
        // Executor: constant-arrival-rate
        //           (k6 controls iterations/sec, not VU count)
        // Covers  : GET books, GET books/{id}, GET reviews, GET orders

        read_heavy_test: {
            executor: 'constant-arrival-rate',
            rate: 1,            // 3 iterations per second
            timeUnit: '1s',
            duration: '1m',
            preAllocatedVUs: 2,            // VUs pre-spun before test
            maxVUs: 5,           // k6 can scale up to this
            tags: { scenario: 'read_heavy' },
            startTime: '4m20s',
            exec: 'readOnlyFlow',

        }
    },

    // ── THRESHOLDS ─────────────────────────────────────────────
    thresholds: {
        // Global — applies across all scenarios

        'http_req_duration': ['p(95)<4000'],
        'http_req_failed': ['rate<0.20'],   // <20% errors globally
        'order_success_rate': ['rate>0.90'],
        'review_success_rate': ['rate>0.90'],
        'order_creation_time': ['p(95)<1500'],
        'review_creation_time': ['p(95)<1500'],

        // Per-scenario thresholds using tags

        'http_req_duration{scenario:smoke}': ['p(95)<2000'],
        'http_req_duration{scenario:load}': ['p(95)<4000'],
        'http_req_duration{scenario:read_heavy}': ['p(95)<3000'],

        // Slow endpoint — expected to be slow, threshold relaxed
        'http_req_duration{name:slow_endpoint}': ['p(95)<6000'],
    },

}

// ─────────────────────────────────────────────────────────────
// SETUP — runs ONCE before all scenarios
// Register + Login → return authauthtoken to all VUs
// ─────────────────────────────────────────────────────────────

export function setup() {

    // Warmup — wake up Render server
    console.log('Warming up server...');
    http.get(`${BASE_URL}/books`);
    sleep(3);

    const username = `k6user_${Date.now()}`;
    const email = `${username}@test.com`;
    const password = "Test@1234";

    // Register User
    const registerResponse = http.post(
        `${BASE_URL}/auth/register`,
        JSON.stringify({ username, password, email }),
        { headers: { "Content-Type": "application/json" } }
    );

    check(registerResponse, {
        'registration successful': (res) => res.status === 201,
    });

    // Login User
    const authResponse = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({ username, password }),
        { headers: { "Content-Type": "application/json" } }
    );

    check(authResponse, {
        'login successful': (res) => res.status === 200,
        'has access authtoken': (res) => res.json("access_token") !== undefined,
    });

    if (authResponse.status !== 200) {
        throw new Error(`Setup failed: Unable to authenticate user - login: ${authResponse.status} ${authResponse.body}`);
    }

    const authtoken = authResponse.json("access_token");
    console.log(`Setup complete: Registered and logged in as ${username}, authtoken Obtained: ${authtoken.substring(0, 20)}...`);
    return { authtoken };

}

// ─────────────────────────────────────────────────────────────
// HELPER — build auth headers (reused across all flows)
// ─────────────────────────────────────────────────────────────

function authHeaders(authtoken) {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authtoken}`
    };
}

// =============================================================
// SCENARIO 1 FUNCTION: smokeFlow
// Purpose: Quick sanity check — all core endpoints respond OK
// Covers : GET /, GET /books, GET /books/{id}, GET /slow
// =============================================================

export function smokeFlow(data) {
    const headers = authHeaders(data.authtoken);

    // Health Check

    group('smoke_01_health_check', () => {
        const res = http.get(`${BASE_URL}/`, { headers });

        check(res, {
            'smoke:health 200': (r) => r.status === 200,
        });

        sleep(1);
    });

    // Browse books

    group('smoke_02_browse_books', () => {
        const res = http.get(`${BASE_URL}/books`, { headers });

        check(res, {
            'smoke: browse status is 200': (r) => r.status === 200,
            'smoke: browse has books': (r) => Array.isArray(r.json().data),

        })

        sleep(1);
    });

    // View Single Books

    group('smoke_03_view_single_books', () => {
        const listRes = http.get(`${BASE_URL}/books`);
        const books = listRes.json().data;
        const firstBookId = books.length > 0 ? books[0].id : null;

        if (firstBookId) {
            const res = http.get(`${BASE_URL}/books/${firstBookId}`, { headers });

            check(res, {
                'smoke: book detail is 200': (r) => r.status === 200,
                'smoke: has title': (r) => r.json('title') !== undefined,
            });
        } else {
            console.warn('No books found — skipping single book view');
        }

        sleep(1);
    });

    // ── Slow Endpoint (Testing Utility) ──
    // Tags this request with name for per-endpoint threshold

    group('smoke_04_slow_endpoint', () => {
        const res = http.get(`${BASE_URL}/slow`, {
            tags: { name: 'slow_endpoint' },
        });

        check(res, {
            'smoke: slow endpoint is 200': (r) => r.status === 200,
        });

        sleep(1);
    });

    // List Review

    group('smoke_05_list_reviews', () => {
        const res = http.get(`${BASE_URL}/reviews`, { headers });

        check(res, {
            'smoke: list reviews is 200': (r) => r.status === 200,
        })

        sleep(1);
    })


}

// =============================================================
// SCENARIO 2 FUNCTION: fullFlow
// Purpose: Complete user journey covering ALL APIs
// Covers : GET /books → POST /books → GET /books/{id}
//          PUT /books/{id} → POST /orders → GET /orders
//          POST /reviews → GET /reviews → DELETE /books/{id}
// =============================================================

export function fullFlow(data) {
    const headers = authHeaders(data.authtoken);

    let createdBookId;
    let orderId;

    // Browse existing books

    group('fullflow_01_browse_books', () => {
        const allRes = http.get(`${BASE_URL}/books`, { headers });
        check(allRes, {
            'fullflow: browse:status is 200': (r) => r.status === 200,
            'fullflow: browse:return an Array': (r) => Array.isArray(r.json().data),
            'fullflow: browse:existing books': (r) => r.body && r.json().data.length > 0,
        })

        sleep(randomIntBetween(1, 2));

        //fetch the limit param
        const limitRes = http.get(`${BASE_URL}/books?limit=5`, { headers });
        check(limitRes, {
            'fullflow: browse:limit param works': (r) => r.status === 200,
            'fullflow: browse:max 5 books returned': (r) => r.body && r.json().data.length <= 5,
        })

        sleep(randomIntBetween(1, 2));
    });

    // View Single Book Details

    group('fullflow_02_view_single_book', () => {
        const listRes = http.get(`${BASE_URL}/books`);
        const books = listRes.json().data;
        const firstBookId = books.find(b => b.stock > 0)?.id || null;

        if (!firstBookId) {
            console.warn('No books available — skipping view');
            return;
        }

        const res = http.get(`${BASE_URL}/books/${firstBookId}`, { headers });

        check(res, {
            'fullflow: details: status is 200': (r) => r.status === 200,
            'fullflow: details: book has title': (r) => r.json('title') !== undefined,
            'fullflow: details: book has Id': (r) => r.json('id') !== undefined,
            'fullflow: details: book has stock': (r) => r.json('stock') !== undefined,
            'fullflow: details: book has price': (r) => r.json('price') !== undefined,
        })

        sleep(randomIntBetween(1, 3));
    });

    // ── Group 3: Create a new book (POST /books) ─────────────
    // Simulates an admin/author adding a book

    group('fullflow_03_create_book', () => {
        const payload = JSON.stringify({
            title: `Load Test Book ${Date.now()}`,
            author: 'k6 Author',
            price: 9.99,
            stock: 100,
            description: 'Created during k6 load test - Exercise 2',
            genre: 'Fiction',
        });

        const createRes = http.post(`${BASE_URL}/books`, payload, { headers });
        check(createRes, {
            'fullflow: create book: status is 201': (r) => r.status === 201,
            'fullflow: create book: has id': (r) => r.json('id') !== undefined,
        });

        if (createRes.status === 200 || createRes.status === 201) {
            createdBookId = createRes.json('id')
            console.log(`[VU ${__VU}] Created Book ID: ${createdBookId}`);
        }

        sleep(randomIntBetween(1, 3));
    });

    // Group 4: Update the created book (PUT /books/{id})

    group('fullflow_04_update_book', () => {
        if (!createdBookId) {
            return console.log('skipping update no book created')
        }

        const updatePayload = JSON.stringify({
            title: `Updated Book ${Date.now()}`,
            author: 'k6 Author',
            genre: 'Fiction',
            price: 12.99,
            stock: 50,
        });

        const updateRes = http.put(`${BASE_URL}/books/${createdBookId}`, updatePayload, { headers });
        check(updateRes, {
            'fullflow: update:200 or 204': (r) => r.status === 200 || r.status === 204,
            'fullflow: update: title changed': (r) => r.json('title') !== undefined
        });

        sleep(randomIntBetween(1, 4));
    });

    // Group 5: place an Order

    group('fullflow_05_place_order', () => {
        let bookToOrder = createdBookId;

        if (!bookToOrder) {
            const booksRes = http.get(`${BASE_URL}/books`);
            const books = booksRes.json().data;
            bookToOrder = books.find(b => b.stock > 0)?.id || null;
        }

        if (!bookToOrder) {
            console.warn('No book available to order — skipping');
            return;
        }

        const start = new Date();

        const orderRes = http.post(`${BASE_URL}/orders`, JSON.stringify({
            book_id: String(bookToOrder),
            quantity: 1
        }), { headers });

        orderCreationTime.add(new Date() - start);

        const success = check(orderRes, {
            'fullflow: order: status is 201': (r) => r.status === 201,
            'fullflow: order: has id': (r) => r.json('id') !== undefined,
        });

        OrderSuccessRate.add(success);

        if (success) {
            orderId = orderRes.json('id');
            console.log(`Order placed: ${orderId}`);
        } else {
            console.error(`Order Failed: ${orderRes.status} - ${orderRes.body}`);
        }

        sleep(randomIntBetween(1, 4));
    });

    // Group 6: Verify Order (GET /orders)

    group('fullflow_06_verify_orders', () => {
        if (!orderId) {
            console.warn("Skipping verify - No Order Placed");
            return;
        }

        const listRes = http.get(`${BASE_URL}/orders`, { headers });
        check(listRes, {
            'fullflow: verify: status is 200': (r) => r.status === 200,
            'fullflow: verify: orderId present': (r) => r.json().data.some(o => o.id === orderId)
        });

        sleep(randomIntBetween(1, 4));
    });

    // Group 7: Add a review (POST /reviews)

    group('fullflow_07_add_reviews', () => {
        let bookToReview = createdBookId;

        if (!bookToReview) {
            const booksRes = http.get(`${BASE_URL}/books`);
            const books = booksRes.json().data;
            bookToReview = books.find(b => b.stock > 0)?.id || null;
        }

        if (!bookToReview) {
            console.warn('No book available to review — skipping');
            return;
        }

        const start = new Date();

        const reviewRes = http.post(`${BASE_URL}/reviews`,
            JSON.stringify({
                book_id: String(bookToReview),
                rating: randomIntBetween(3, 5),
                comment: `Great book! Load test review by VU ${__VU}`,
            }),
            { headers }
        );

        reviewCreationTime.add(new Date() - start);

        const success = check(reviewRes, {
            'fullflow: review:200 or 201': (r) => r.status === 200 || r.status === 201,
            'fullflow: review: has id': (r) => r.json('id') !== undefined
        });

        reviewSuccessRate.add(success);

        if (!success) {
            console.error(`Review Failed: ${reviewRes.status} - ${reviewRes.body}`);
        }

        sleep(randomIntBetween(1, 4));
    });

    // Group 8: List Review (GET /reviews)

    group('fullflow_08_list_reviews', () => {
        const res = http.get(`${BASE_URL}/reviews`);
        check(res, {
            'fullflow: reviews: status is 200': (r) => r.status === 200,
            'fullflow: reviews: has comments': (r) => r.json().data.length > 0 && r.json().data[0].comment !== undefined,
            'fullflow: reviews: has data': (r) => Array.isArray(r.json().data),
        });

        sleep(randomIntBetween(1, 3));
    });

    // ── Group 9: Delete created book (DELETE /books/{id}) ────
    // Cleanup: remove the book we created in group 3

    group('fullflow_09_delete_books', () => {
        if (!createdBookId) {
            return console.warn('Skipping deletion: no book to delete');
        }

        const deleteRes = http.del(`${BASE_URL}/books/${createdBookId}`, null, { headers });
        check(deleteRes, {
            'fullflow: delete: 200 or 204': (r) => r.status === 200 || r.status === 204,
        });

        console.log(`Deleted Book Id: ${createdBookId}`);

        sleep(randomIntBetween(1, 3));
    });
}

// =============================================================
// SCENARIO 3 FUNCTION: readOnlyFlow
// Purpose: High-frequency read traffic — simulate real users
//          browsing without placing orders
// Covers : GET /books, GET /books/{id}, GET /reviews, GET /orders
// =============================================================


export function readOnlyFlow(data) {
    const headers = authHeaders(data.authtoken);

    // Randomly pick which read action this iteration does
    // This simulates different users doing different things

    const action = randomIntBetween(1, 4);

    switch (action) {
        case 1:
            // List all books
            group('read_01_list_books', () => {
                const res = http.get(`${BASE_URL}/books`);
                check(res, {
                    'read: book 200': (r) => r.status === 200,
                    'read: has array': (r) => Array.isArray(r.json().data),
                });
            });

            break;
        case 2:
            // View a specific book (random id between 1-5)
            group('read_02_view_book', () => {
                const bookId = randomIntBetween(1, 5);
                const res = http.get(`${BASE_URL}/books/${bookId}`);

                check(res, {
                    'read: book detail 200 or 404': (r) => r.status === 200 || r.status === 404,
                });
            });

            break;

        case 3:
            // List all reviews
            group('read_03_list_reviews', () => {
                const res = http.get(`${BASE_URL}/reviews`);
                check(res, {
                    'read: reviews 200': (r) => r.status === 200,
                });
            });
            break;

        case 4:
            // List orders (authenticated read)
            group('read_04_list_orders', () => {
                const res = http.get(`${BASE_URL}/orders`, { headers });
                check(res, {
                    'read: order 200': (r) => r.status === 200,
                });
            });
            break;
    }

    sleep(randomIntBetween(1, 3));
}


// ─────────────────────────────────────────────────────────────
// TEARDOWN — runs ONCE after all scenarios finish
// ─────────────────────────────────────────────────────────────
export function teardown(data) {
    console.log(
        `[teardown] All scenarios complete. authtoken: ${data.authtoken.substring(0, 20)}...`
    );
}