import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

export const options = {
    vus: 5,
    duration: '10s',
    thresholds:{
        checks: ['rate>0.95'],
        my_custom_counter: ['count>5'],
        news_page_response_time: ['p(95)<300']
    }
};

let myCustom = new Counter('my_custom_counter');
let newsPageResponseTime = new Trend('news_page_response_time');

export default function () {
    const res = http.get('https://quickpizza.grafana.com/test.k6.io/');
    check(res, {
        'status is 200': (r) => r.status === 200,
        'page is home': (r) => r.body.includes('Note that this is a shared testing environment')
    });
    myCustom.add(1);
    const response = http.get('https://quickpizza.grafana.com/news.php');
    newsPageResponseTime.add(response.timings.duration);
    sleep(1);
}