import http from 'k6/http';
import { check } from 'k6';


export default function () {
    const res = http.get('https://quickpizza.grafana.com/test.k6.io/');
    check(res, {
        'status is 200': (r) => r.status === 200,
        'page is home': (r) => r.body.includes('Note that this is a shared testing environment')
    });
}