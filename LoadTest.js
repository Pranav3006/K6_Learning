import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

export const options = {
    stages: [
        { duration: '30s', target: 5 },
        { duration: '2m', target: 5 },
        { duration: '30s', target: 0 }
    ],

    thresholds: {
        http_req_duration: ['p(95)<500'],
        checks: ['rate>0.95'],
        http_req_failed: ['rate<0.02']
    },

    cloud: {
        projectID:7689032
    }
};


const bookData = new SharedArray('book with details', function () {
    return JSON.parse(open('./books_5k.json'));
});

const userCredentials = new SharedArray('user with credentials', function () {
    return JSON.parse(open('./users.json'));
});

export default function () {

    const randomBook = randomItem(bookData);
    const randomUser = randomItem(userCredentials);

    const BaseURL = 'https://k6-bookstore-api.onrender.com';

    let res = http.post(
        `${BaseURL}/auth/login`,
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
        `${BaseURL}/books`,
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
            },
            tags: { name: 'Create Book' }
        }
    ).json().id;

    const resp = http.get(`${BaseURL}/books/${book_id}`)

    http.put(
        `${BaseURL}/books/${book_id}`,
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
            },
            tags: { name: 'Update Book' }
        }
        
    )

    http.del(`${BaseURL}/books/${book_id}`,
        null, {
        headers: {
            'Authorization': `Bearer ${access_token}`
        },
        tags: { name: 'Delete Book' }
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