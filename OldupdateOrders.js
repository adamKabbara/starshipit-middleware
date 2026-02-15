// import { writeFile } from "fs/promises";

export async function handler(event, context) {
  console.log("Running scheduled UpdatedOrders");
  var myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("StarShipIT-Api-Key", "c438e1afe4eb46db8e23e43812f1b4d0");
  myHeaders.append(
    "Ocp-Apim-Subscription-Key",
    "9ea24a20359e4b228a7cb5d0b695e6f0"
  );

  let updatedOrderMsg;
  let allDupOrders = [];
  let dupOrderswithZeroQty = [];
  const ordersWithDuplicateSKUExcludingZeroQty = [];


  var requestOptions = {
    method: "GET",
    headers: myHeaders,
    redirect: "follow",
  };

  try {
    let obj = await fetchOrders();
    let orders = obj.orders;

    // await writeOrdersToFile(obj);

    // return
    let dups = getOrdersWithDuplicateSKU(orders);
    let consolidatedOrders = consolidateSKU(dups);
    updatedOrderMsg = await updateWithRetries(consolidatedOrders);
  } catch (error) {
    console.error("Error fetching or processing orders:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }


  async function fetchOrders() {
    return await fetch(
      "https://api.starshipit.com/api/orders/unshipped?limit=250&since_order_date=2026-02-103T06:00:00.000Z",
      requestOptions
    ).then((response) => response.json());
  }

  // async function writeOrdersToFile(orders) {
  //   await writeFile("orders.json", JSON.stringify(orders, null, 2), "utf-8");
  // }

  function consolidateSKU(orders) {

    const consolidatedOrders = [];
    orders.forEach((order) => {
      const combinedItems = [];
      const duplicateItems = [];

      order.items.forEach((item) => {
        const existingItem = combinedItems.find((i) => i.sku === item.sku);
        if (existingItem) {
          existingItem.value += item.value;
          existingItem.quantity += item.quantity;
          existingItem.quantity_to_ship += item.quantity_to_ship;
          existingItem.quantity_shipped += item.quantity_shipped;

          // Add duplicate item with quantity as 0
          duplicateItems.push({
            ...item,
            quantity: 0,
            quantity_to_ship: 0,
            quantity_shipped: 0,
          });
        } else {
          combinedItems.push({ ...item });
        }
      });

      // Include duplicate items with quantity as 0
      combinedItems.push(...duplicateItems);

      consolidatedOrders.push({
        order_id: order.order_id,
        destination: order.destination ? { name: order.destination.name } : undefined,
        items: combinedItems,
      });
    });
    return consolidatedOrders;
  }

  async function updateOrder(order) {
    let raw = JSON.stringify({ order: order });
    var requestOptions = {
      method: "PUT",
      headers: myHeaders,
      body: raw,
      redirect: "follow",
    };

    let response = await fetch(
      "https://api.starshipit.com/api/orders",
      requestOptions
    );
    return response.status === 200;
  }

  function updateOrderList(orders) {
    orders.forEach((order) => {
      updateOrder(order);
    });
  }

  async function updateWithRetries(consolidatedOrders) {
    let SuccessfullyUpdated = [];
    for (const order of consolidatedOrders) {
      let retries = 3;
      while (retries > 0) {
        let res = await updateOrder(order);
        if (res) {
          console.log(`Successfully updated order: ${order.order_id}`);
          SuccessfullyUpdated.push([order.order_id, order.destination.name]);
          break;
        } else {
          retries--;
          console.error(
            `Failed to update order: ${order.order_id}. Retries left: ${retries}.`
          );
          if (retries === 0) {
            console.error(`Giving up on order: ${order.order_id}`);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay before retry
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay before next API call
    }
    return SuccessfullyUpdated;
  }

  function getOrdersWithDuplicateSKU(orders) {
    const ordersWithDuplicateSKU = [];
    orders.forEach((order) => {
      const skuCount = {};
      order.items.forEach((item) => {
        skuCount[item.sku] = (skuCount[item.sku] || 0) + 1;
      });
      const hasDuplicateSKU = Object.values(skuCount).some(
        (count) => count > 1
      );
      if (hasDuplicateSKU) {
        allDupOrders.push([
          order.order_id,
          order.destination && order.destination.name ? order.destination.name : null
        ]);
        ordersWithDuplicateSKU.push(order);
      }
    });

    // Find orders with duplicate SKU, but only count items with quantity > 0
    orders.forEach((order) => {
      const skuCount = {};
      order.items.forEach((item) => {
        if (item.quantity > 0) {
          skuCount[item.sku] = (skuCount[item.sku] || 0) + 1;
        }
      });
      const hasDuplicateSKU = Object.values(skuCount).some(
        (count) => count > 1
      );
      if (hasDuplicateSKU) {
        ordersWithDuplicateSKUExcludingZeroQty.push(order);
        dupOrderswithZeroQty.push([
          order.order_id,
          order.destination && order.destination.name ? order.destination.name : null
        ]);
      }
    });

    return ordersWithDuplicateSKUExcludingZeroQty;
  }

  console.log(allDupOrders)
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      allDupOrders: allDupOrders,
      updatedOrders: updatedOrderMsg,
    }),
  };
}

export const config = {
  schedule: "*/15 * * * *", // every 5 minutes
};


// handler()