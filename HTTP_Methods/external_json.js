import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

const userCredentials = new SharedArray('user with credentials', function () {
    return JSON.parse(open('../users.json'));
});



export default function () {

    const randomCredentials = randomItem(userCredentials);

    // userCredentials.forEach((items) => {

    //     const credentials = {
    //         username: items.username,
    //         password: items.password,
    //         email: items.email
    //     }

    //     const res = http.post(
    //     'http://localhost:8000/auth/register',
    //     JSON.stringify({
    //         username: credentials.username,
    //         password: credentials.password,
    //         email: credentials.email
    //     }),
    //     {
    //         headers: { 'Content-Type': 'application/json' }
    //     }
    // )
    // });

    const res = http.post(
        'http://localhost:8000/auth/register',
        JSON.stringify({
            username: randomCredentials.username,
            password: randomCredentials.password,
            email: randomCredentials.email
        }),
        {
            headers: { 'Content-Type': 'application/json' }
        }
    )

    check(res, {
        'is status 201': (r) => r.status === 201,
        'is having id': (r) => r.json().id !== undefined
    });
}
