import http from 'k6/http';
import { check } from 'k6';


export default function () {

    let res = http.post(
        'http://localhost:8000/auth/login',
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
        'http://localhost:8000/books',
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

    res = http.get(`http://localhost:8000/books/${book_id}`)

    check(res,{
        'status is 200': (r) => r.status === 200,
        'book id is correct': (r) => r.json().id === book_id
    })

    http.put(
        'http://localhost:8000/books',
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

    http.del(`http://localhost:8000/books/${book_id}`,
        null,{
        headers: {
            'Authorization': `Bearer ${access_token}`
        }
    })

    http.get(`http://localhost:8000/books/${book_id}`)
}