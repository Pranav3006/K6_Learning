import http from 'k6/http';
import { check } from 'k6';


export default function () {

    // BaseURL = 'https://k6-bookstore-api.onrender.com/';
    const BaseURL = 'https://k6-bookstore-api.onrender.com';

    let res = http.post(
        `${BaseURL}/auth/login`,
        JSON.stringify({
            "username": "alice",
            "password": "alice123"
        }),
        {
            headers: { 'Content-Type': 'application/json' }
        }
    )

    const access_token = res.json().access_token;

    const book_id = http.post(
        `${BaseURL}/books`,
        JSON.stringify({
            "title": "Death Note",
            "author": "Prakhar",
            "genre": "Horror, Thriller",
            "price": 299,
            "stock": 2
        }
        ),
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`
            }
        }
    ).json().id;

    res = http.get(`${BaseURL}/books/${book_id}`)

    check(res,{
        'status is 200': (r) => r.status === 200,
        'book id is correct': (r) => r.json().id === book_id
    })

    http.put(
        `${BaseURL}/books/${book_id}`,
        JSON.stringify({
            "title": "Death Note",
            "author": "Prakhar",
            "genre": "Horror, Thriller, Suspense",
            "price": 299,
            "stock": 2
        }
        ),
        {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`
            }
        }
    )

    http.del(`${BaseURL}/books/${book_id}`,
        null,{
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    })

    http.get(`${BaseURL}/books/${book_id}`)
}