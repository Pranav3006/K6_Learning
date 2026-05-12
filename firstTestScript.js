import http from 'k6/http';
import { sleep, check } from 'k6';
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

export const options={
    // vus:50,
    // duration:'10s',
    stages:[
        // {duration:'120s', target: 100},
        // {duration:'360s', target: 100},
        // {duration:'120s', target: 0},
        {duration:'3s', target: 10},
        {duration:'5s', target: 10},
        {duration:'3s', target: 0},
    ],

    thresholds: {
        http_req_duration: ['p(95)<300'],
        http_req_failed: ['rate<0.02'],
        checks: ['rate>0.95'],
    },
}


export default function () {
     const res = http.get('https://test.k6.io');

     check(res,{
        'status is 200': (r) => r.status == 200
     })

     sleep(1);
}

export function handleSummary(data) {
    return {
        'summary.json': JSON.stringify(data),
        'summary.html': htmlReport(data),
    }
}