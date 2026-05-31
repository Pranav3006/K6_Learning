import http from 'k6/http';

export default function () {

    const BaseURL = 'https://k6-bookstore-api.onrender.com';

    // const URL= 'http://localhost:8000/auth/register';
    // const body= JSON.stringify({
    //     username: "pranav",
    //     password: "pranav3006",
    //     email:'pranav@gmail.com'
    // })
    const params = {
        headers: {
            'Content-Type': 'application/json',
            accept: 'application/json',
        },
    };

    const payload = JSON.stringify({
        username: "pranav",
        password: "pranav3006"
    })
    
    // http.post(URL, body, params);
   const res = http.post(`${BaseURL}/auth/login`, payload, params);

   console.log(res.json().access_token);

}