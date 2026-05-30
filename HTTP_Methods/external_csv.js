import http from 'k6/http';
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';
import { SharedArray } from 'k6/data';

const userCredentials = new SharedArray('user with credentials', function () {
    return papaparse.parse((open('../users.csv')), { header: true }).data;
});

export default function () {

    userCredentials.forEach((items) => {

        const credentials = {
            username: items.username,
            password: items.password,
            email: items.email
        }
    })


}