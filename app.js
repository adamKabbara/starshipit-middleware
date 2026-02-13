var myHeaders = new Headers();
myHeaders.append("Content-Type", "application/json");
myHeaders.append("StarShipIT-Api-Key", "c438e1afe4eb46db8e23e43812f1b4d0");
myHeaders.append("Ocp-Apim-Subscription-Key", "9ea24a20359e4b228a7cb5d0b695e6f0");

var requestOptions = {
  method: 'GET',
  headers: myHeaders,
  redirect: 'follow'
};

fetch("https://api.starshipit.com/api/orders/unshipped", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));