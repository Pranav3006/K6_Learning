import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {

    stages: [
        { duration: '10s', target: 5 },
        { duration: '1m', target: 5 },
        { duration: '10s', target: 0 }
    ],

    thresholds: {
        http_req_duration: ['p(95)<500'],
        checks: ['rate>0.95'],
        http_req_failed: ['rate<0.02']
     }
}

export default function () {

    const BaseURL = 'https://k6-bookstore-api.onrender.com';

    const res = http.get(
        `${BaseURL}/books?page=1&stock=25`
    );

    const data = res.json().data;
    const genre = data.some(book => book.genre === 'Technology');

    console.log(res.headers['Content-Type']);


    check(res, {
        'status is 200': (r) => r.status === 200,

        'book with stock 25 exists': () =>
            data.some(book => book.stock === 25),
        'book with genre technology exists': () => genre
    });

    sleep(1);
}
