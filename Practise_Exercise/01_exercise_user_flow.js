// =============================================================
// Exercise 1: Realistic End-to-End User Flow
// Concepts: groups, think time (sleep), checks, HTTP methods
// API: Simple Bookstore API
// =============================================================

import http from 'k6/http';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom Trend metric to track order placement time and a Rate metric to track order success vs failure
const orderCreationTime = new Trend('order_creation_time', true); // true for time unit (ms)
const orderSuccessRate = new Rate('order_success_rate'); // 1 for success, 0 for failure


export const options = {
    stages: [
        { duration: '10s', target: 5 }, // Ramp up to 5 users over 30 seconds
        { duration: '3m', target: 5 },  // Stay at 5 users for 3 minutes
        { duration: '10s', target: 0 },   // Ramp down to 0 users over 30 seconds
    ],

    // vus: 3,
    // duration: '30s',

    thresholds: {
        'order_creation_time': ['p(95)<500'], // 95% of order placements should be under 500ms
        'order_success_rate': ['rate>0.95'],   // At least 95% of orders should be successful
        'http_req_duration': ['p(95)<3000'],   // 95% of all HTTP requests should be under 1 second
        'http_req_failed': ['rate<0.01'],        // Less than 1% of HTTP requests should fail
    },
}

// Base URL for the API
const BASE_URL = 'https://k6-bookstore-api.onrender.com';

export function setup() {

    // Each test run needs a unique email to avoid 409 "already registered"
    // const uniqueEmail = `perf_tester_${Date.now()}@example.com`;

    const username = `k6user_${Date.now()}`;
    const email = `${username}@test.com`;
    const password = "Test@1234";

    // Register User

    http.post(
        `${BASE_URL}/auth/register`,
        JSON.stringify({ username, password, email }),
        { headers: { "Content-Type": "application/json" } }
    );

    //Authenticate User
    const authRes = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({ username, password }),
        { headers: { "Content-Type": "application/json" } }
    );

    check(authRes, {
        'auth:status is 200': (r) => r.status === 200,
        'auth: has accessToken': (r) => r.json("access_token") !== undefined,
    });

    if (authRes.status !== 200) {
        // If authentication fails, we can't proceed with the test, so we throw an error to stop execution.
        throw new Error(
            '`Auth failed [${authRes.status}]: ${authRes.body}`'
        );
    }

    const authToken = authRes.json("access_token");
    console.log(`[setup] Token Obtained: ${authToken.substring(0, 20)}...`);
    return { authToken }; // Return value to be used in the default function as data parameter
}

export default function (data) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.authToken}`
    };

    //Group 1: health check
    group('01_health_check', () => {
        const res = http.get(`${BASE_URL}/`);

        check(res, {
            'health: status is 200': (r) => r.status === 200,
        })

        sleep(randomIntBetween(1, 4));
    });




    // ── GROUP 2: Browse catalogue ────────────────────────────────────
    // User browses all books, then filters to fiction only.

    let availableBookId;
    let orderId;

    group('02_browse_catalogue', () => {

        const allBooksRes = http.get(`${BASE_URL}/books`);

        check(allBooksRes, {
            'browse: book list status is 200': (r) => r.status === 200,
            'browse: book returns an array': (r) => r.body && Array.isArray(r.json().data),
            'browse: at least 1 book available': (r) => r.body && r.json().data.length > 0,
        });

        if (!allBooksRes.body) return;

        sleep(randomIntBetween(1, 3));

        // Filter to fiction books and pick the available first book

        const fictionBookRes = http.get(`${BASE_URL}/books?limit=5`);

        check(fictionBookRes, {
            'fiction: status is 200': (r) => r.status === 200,
            'fiction: fiction has results': (r) => r.body && r.json().data.length > 0,
        });

        // Find the first book with available === true
        const books = fictionBookRes.json().data;
        // console.log(`Fiction books body: ${fictionBookRes.body}`);
        const availableBooks = books.find(b => b.stock > 0);

        if (availableBooks) {
            console.log(`Found available book: ${availableBooks.title} (ID: ${availableBooks.id})`);
            availableBookId = availableBooks.id;
        }

        else {
            console.warn('No available books found in fiction category - falling back to bookId=1');
            availableBookId = 1;
        }

        sleep(randomIntBetween(1, 3));

    });

    // Group3: View book details 
    group('03_view_book_details', () => {
        const res = http.get(`${BASE_URL}/books/${availableBookId}`);

        check(res, {
            'details: status is 200': (r) => r.status === 200,
            'details: has id': (r) => r.json("id") !== undefined,
            'details: has title': (r) => r.json("title") !== undefined,
            'details: has price': (r) => r.json("price") !== undefined,
        });

        sleep(randomIntBetween(1, 5));
    });



    // ── GROUP 4: Place order ────────────────────────────────────
    // User adds the book to their cart, then places an order.

    group('04_place_order', () => {
        const startTime = new Date();

        const orderRes = http.post(
            `${BASE_URL}/orders`,
            JSON.stringify({
                book_id: availableBookId,
                quantity: 1
            }),
            { headers }
        );

        // Record to our custom Trend metric (ms elapsed)
        orderCreationTime.add(new Date() - startTime);

        const orderPlace = check(orderRes, {
            'order: status is 201': (r) => r.status === 201,
            'order: has orderId': (r) => r.json("id") !== undefined,
        });

        // Record success (1) or failure (0) to our custom Rate metric
        orderSuccessRate.add(orderPlace);

        if (orderPlace) {
            orderId = orderRes.json("id");
            console.log(`Order placed successfully with ID: ${orderId}`);
        }
        else {
            console.error(`Order placement failed: ${orderRes.status} - ${orderRes.body}`);
        }

        sleep(randomIntBetween(2, 6));
    });



    // Group 5: Verify Order
    group('05_verify_order', () => {
        if (!orderId) {
            console.warn('Skipping order verification due to failed order placement');
            return;
        }

        const verifyRes = http.get(`${BASE_URL}/orders`, { headers });
        console.log(`Orders list: ${verifyRes.body}`);

        check(verifyRes, {
            'verify: status is 200': (r) => r.status === 200,
            'verify: correct orderId': (r) => r.json().data.some(o => o.id === orderId),
            'verify: correct bookId': (r) => r.json().data.some(o => o.book_id === availableBookId),
        });

        sleep(randomIntBetween(1, 3));
    });

}

// Optional teardown function for clean up after the test

export function teardown(data) {
    console.log('Test Completed. Token used was: ' + data.authToken.substring(0, 20) + '...');
}