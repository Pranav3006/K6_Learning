import http from 'k6/http';
import { sleep, check } from 'k6';

export default function () {

    const res = http.get(
        'http://localhost:8000/books?page=1&stock=25'
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