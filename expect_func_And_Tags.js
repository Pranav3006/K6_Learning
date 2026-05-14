import http from 'k6/http';
import { expect } from 'https://jslib.k6.io/k6-testing/0.5.0/index.js';
import { check } from 'k6';

export const options = {
    vus: 5,
    duration: '10s',
    thresholds: {
        checks: ['rate>0.95'],
        'checks{name:status_check}': ['rate>0.99'],
        http_req_duration: ['p(95)<300'],
        'http_req_duration{status:200}': ['p(95)<300'],
        'http_req_duration{name:delayed_request}': ['p(95)<200']
    }
};

export default function () {
    const res = http.get('https://httpbin.org/delay/5',{tags:{name:'delayed_request'}});

    check(res,{
        'status is 200': (r) => r.status === 200,
        },{name:'status_check'});  
   
    expect(res.timings.duration).toBeLessThan(300);

}