// import orders from './orders.js'
const fs = require("fs");


var myHeaders = new Headers();
myHeaders.append("Content-Type", "application/json");
myHeaders.append("StarShipIT-Api-Key", "c438e1afe4eb46db8e23e43812f1b4d0");
myHeaders.append(
  "Ocp-Apim-Subscription-Key",
  "9ea24a20359e4b228a7cb5d0b695e6f0"
);

var requestOptions = {
  method: "GET",
  headers: myHeaders,
  redirect: "follow",
};

(async function () {
  let obj = await fetchOrders();
  let orders = obj.orders;
  // getOrderCount(orders)
  // findOrder(orders, "Adam Kabbara")
  // writeOrderstoJson(orders)
  let order = findOrderById(orders, "665994928");
  let consolidatedOrder = consolidateSKU([order]);

  
  // updateOrder(consolidatedOrder)
})()

async function fetchOrders() {
  return await fetch("https://api.starshipit.com/api/orders/unshipped", requestOptions)
  .then(response => response.json())

}


function consolidateSKU(orders) {
  const consolidatedOrders = [];
  orders.forEach((order) => {
  console.log(order)
  const combinedItems = [];
  

  order.items.forEach((item) => {
    const existingItem = combinedItems.find((i) => i.sku === item.sku);
    if (existingItem) {
      existingItem.value += item.value;
      existingItem.quantity += item.quantity;
      existingItem.quantity_to_ship += item.quantity_to_ship;
      existingItem.quantity_shipped += item.quantity_shipped;
    } else {
      combinedItems.push({ ...item });
    }
  });

  consolidatedOrders.push({ order_id: order.order_id, items: combinedItems });
  console.log(consolidatedOrders[0])
});
  return (consolidatedOrders[0]);
// console.log(obj.orders[0].items);  
}

function findOrder(orders ,name) {
  const order = orders.find((order) => order.destination.name === name);
  if (order) {
    console.log(order);
  } else {
    console.log("Order not found for destination name:", name);
  }
}

function findOrderById(orders, id) {
  
  const order = orders.find((order) => order.order_id == id);
  if (order) {
    return order
  } else {
    console.log("Order not found for ID:", id);
  }
} 

function getOrderCount(orders) {
  console.log("Total number of orders:", orders.length);
}

function listOrders(orders) {
  obj.orders.forEach((order) => {
    console.log(order);
  });
}


function writeOrderstoJson(orders) {
  const jsonData = JSON.stringify(orders, null, 2);
  fs.writeFile("orders.json", jsonData, (err) => {
    if (err) {
      console.error("Error writing to file:", err);
    } else {
      console.log("Orders have been written to orders.json");
    }
  });
}


function updateOrder(order) {

  let raw = JSON.stringify({ "order": order })
  var requestOptions = {
    method: "PUT",
    headers: myHeaders,
    body: raw,
    redirect: "follow",
  };



  fetch("https://api.starshipit.com/api/orders", requestOptions)
    .then((response) => response.text())
    .then((result) => console.log(result))
    .catch((error) => console.log("error", error));
}

