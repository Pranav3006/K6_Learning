import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

export const options = {
    stages: [
        { duration: '120s', target: 50 },
        { duration: '15m', target: 50 },
        { duration: '120s', target: 0 }
    ],

    thresholds: {
        http_req_duration: ['p(95)<500'],
        checks: ['rate>0.95'],
        http_req_failed: ['rate<0.02']
    }
};


const bookData = new SharedArray('book with details', function () {
    return JSON.parse(open('../books_5k.json'));
});

const userCredentials = new SharedArray('user with credentials', function () {
    return JSON.parse(open('../users.json'));
});

export default function () {

    const randomBook = randomItem(bookData);
    const randomUser = randomItem(userCredentials);


    let res = http.post(
        'http://localhost:8000/auth/login',
        JSON.stringify({
            "username": randomUser.username,
            "password": randomUser.password
        }),
        {
            headers: { 'Content-Type': 'application/json' }
        }
    )

    const access_token = res.json().access_token;


    const book_id = http.post(
        'http://localhost:8000/books',
        JSON.stringify({
            title: randomBook.title,
            author: randomBook.author,
            genre: randomBook.genre,
            price: randomBook.price,
            stock: randomBook.stock
        }
        ),
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`
            }
        }
    ).json().id;

    const resp = http.get(`http://localhost:8000/books/${book_id}`)

    http.put(
        'http://localhost:8000/books',
        JSON.stringify({
            title: randomBook.title,
            author: randomBook.author,
            genre: randomBook.genre + ' Updated',
            price: randomBook.price,
            stock: randomBook.stock
        }
        ),
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`
            }
        }
    )

    http.del(`http://localhost:8000/books/${book_id}`,
        null, {
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    })

    check(res, {
        'status is 200': (r) => r.status === 200,
        'have access token': (r) => r.json().access_token !== undefined
    })

    check(resp, {
        'status is 200': (r) => r.status === 200,
        'book id is correct': (r) => r.json().id === book_id
    })

}