import http from 'k6/http';
import { sleep } from 'k6';
import exec from 'k6/execution';

export const options={
    vus: 1,
    duration: '10s'
}

export function setup(data) {
    let res = http.get('https://quickpizza.grafana.local/test.k6.local/status');
    if(res.error){
        console.error('Application is not running, aborting the test');
        exec.test.abort();
    }
}

export default function () {
    http.get('https://quickpizza.grafana.com/test.k6.local/some-page');
    sleep(1);
}