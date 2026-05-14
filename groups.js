import http from 'k6/http';
import { check, group } from 'k6';

export const options = {
    vus: 5,
    duration: '10s',
    thresholds: {
        checks: ['rate>0.95'],
        'checks{name:status_check}': ['rate>0.99'],
        http_req_duration: ['p(95)<300'],
        'http_req_duration{status:200}': ['p(95)<300'],
        'http_req_duration{group:::Main Page}': ['p(95)<300']
    }
};

export default function () {

    group('Main Page', function () {
        let res = http.get('https://quickpizza.grafana.com/test.k6.io/');
        check(res, {
            'status is 200': (r) => r.status === 200,
        });

        group('Assets', function(){
        http.get('https://quickpizza.grafana.com/test.k6.io/assets/app.css');
        http.get('https://quickpizza.grafana.com/test.k6.io/assets/app.js');
    })
    });
    // const res = http.get('https://quickpizza.grafana.com/test.k6.io/');

    group('News_page', function(){
        let res = http.get('https://quickpizza.grafana.com/news.php');
        check(res,{
        'status is 200': (r) => r.status === 200,
        },{name:'status_check'}); 
    })

     

}