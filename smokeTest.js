import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
    vus: 1,
    duration: '30s',
};

export default function () {
    http.get('https://quickpizza.grafana.com/test.k6.io/');
    sleep(1);
    http.get('https://quickpizza.grafana.com/contact.php');
    sleep(2);
    http.get('https://quickpizza.grafana.com/news.php');
    sleep(2);
}