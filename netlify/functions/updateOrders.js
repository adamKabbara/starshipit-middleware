// import { writeFile } from "fs/promises";

export async function handler(event, context) {
  const apiKey1 = "c438e1afe4eb46db8e23e43812f1b4d0";
  const apiKey2 = "6350596f90b345d9b3987081ae7a0929";
  const apiKeys = [apiKey1, apiKey2];
  const ocpKey = "9ea24a20359e4b228a7cb5d0b695e6f0";

  console.log("Running scheduled UpdatedOrders");
  let myHeaders;
  let requestOptions;

  const accountResults = [];
  let allDupOrders = [];
  let dupOrderswithZeroQty = [];
  let ordersWithDuplicateSKUExcludingZeroQty = [];
  const API_DELAY_MS = 1000;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      myHeaders = new Headers();
      myHeaders.append("Content-Type", "application/json");
      myHeaders.append("StarShipIT-Api-Key", apiKey);
      myHeaders.append("Ocp-Apim-Subscription-Key", ocpKey);

      requestOptions = {
        method: "GET",
        headers: myHeaders,
        redirect: "follow",
      };

      allDupOrders = [];
      ordersWithDuplicateSKUExcludingZeroQty = [];
      dupOrderswithZeroQty = [];

      let obj = await fetchOrders();
      await delay(API_DELAY_MS);
      let orders = obj.orders;

      // await writeOrdersToFile(obj, `orders-${i + 1}.json`);

      let dups = getOrdersWithDuplicateSKU(orders);
      let consolidatedOrders = consolidateSKU(dups);

      const SKUCUSTOM4PACK = "SKUCUSTOM4PACK";
      const hasSkuCustom4PackWithNonZeroQty = (o) =>
        o.items.some((item) => item.sku === SKUCUSTOM4PACK && item.quantity !== 0);
      const ordersWithSkuCustom4Pack = orders.filter((o) =>
        o.items.some((item) => item.sku === SKUCUSTOM4PACK)
      );
      const dupOrderIds = new Set(dups.map((d) => d.order_id));
      const skuCustom4PackOnlyOrders = ordersWithSkuCustom4Pack.filter(
        (o) => !dupOrderIds.has(o.order_id) && hasSkuCustom4PackWithNonZeroQty(o)
      );
      const skuCustom4PackUpdates = skuCustom4PackOnlyOrders.map(buildOrderWithSkuCustom4PackZeroed);

      let updatedFromDuplicateSku = await updateWithRetries(consolidatedOrders);
      let updatedFromSkuCustom4Pack = await updateWithRetries(skuCustom4PackUpdates);

      accountResults.push({
        allDupOrders: [...allDupOrders],
        updatedFromDuplicateSku,
        updatedFromSkuCustom4Pack,
      });

      if (i < apiKeys.length - 1) {
        await delay(API_DELAY_MS);
      }
    }
  } catch (error) {
    console.error("Error fetching or processing orders:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }


  async function fetchOrders() {
    return await fetch(
      "https://api.starshipit.com/api/orders/unshipped?limit=250&since_last_updated=2024-05-27T06:00:00.000Z&since_order_date=2024-05-27T06:00:00.000Z",
      requestOptions
    ).then((response) => response.json());
  }

  // async function writeOrdersToFile(orders, filename = "orders.json") {
  //   await writeFile(filename, JSON.stringify(orders, null, 2), "utf-8");
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

      // Set SKUCUSTOM4PACK item quantities to 0
      combinedItems.forEach((item) => {
        if (item.sku === "SKUCUSTOM4PACK") {
          item.quantity = 0;
          item.quantity_to_ship = 0;
          item.quantity_shipped = 0;
        }
      });

      consolidatedOrders.push({
        order_id: order.order_id,
        destination: order.destination ? { name: order.destination.name } : undefined,
        items: combinedItems,
      });
    });
    return consolidatedOrders;
  }

  function buildOrderWithSkuCustom4PackZeroed(order) {
    return {
      order_id: order.order_id,
      destination: order.destination ? { name: order.destination.name } : undefined,
      items: order.items.map((item) =>
        item.sku === "SKUCUSTOM4PACK"
          ? { ...item, quantity: 0, quantity_to_ship: 0, quantity_shipped: 0 }
          : { ...item }
      ),
    };
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
      await delay(API_DELAY_MS);
      let retries = 3;
      while (retries > 0) {
        let res = await updateOrder(order);
        if (res) {
          console.log(`Successfully updated order: ${order.order_id}`);
          SuccessfullyUpdated.push([order.order_id, order.destination?.name ?? null]);
          break;
        } else {
          retries--;
          console.error(
            `Failed to update order: ${order.order_id}. Retries left: ${retries}.`
          );
          if (retries === 0) {
            console.error(`Giving up on order: ${order.order_id}`);
          } else {
            await delay(API_DELAY_MS);
          }
        }
      }
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
  // console.log(JSON.stringify(accountResults))
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      account1: accountResults[0] ?? {
        allDupOrders: [],
        updatedFromDuplicateSku: [],
        updatedFromSkuCustom4Pack: [],
      },
      account2: accountResults[1] ?? {
        allDupOrders: [],
        updatedFromDuplicateSku: [],
        updatedFromSkuCustom4Pack: [],
      },
    }),
  };
}

// export const config = {
//   schedule: "*/15 * * * *", // every 5 minutes
// };


// handler().then((res) => console.log(res))