const http = require("http");
const server = http.createServer();
const request = require("request");
const fs = require("fs-extra");

const serverHost = "app.garuradi.jp";

const zeroPadding = (num, length) => {
  return ("0000000000" + num).slice(-length);
};

const replaceFolderName = str => {
  const specialChars = /\:|\?|"|<|>|\|/g;
  const spaces = /\s\s+/g;
  const backSlash = /\\/g;
  const slashs = /\/\/+/g;
  const sandwich = /(\s\/|\/\s)+(\s|\/)?/g;

  const replacedStr = str
    .replace(specialChars, `-`)
    .replace(backSlash, `\/`)
    .replace(spaces, ` `)
    .replace(slashs, `\/`)
    .replace(sandwich, `\/`);

  return replacedStr;
};

const saveCache = (url, postData, response) => {
  fs.readFile(`${__dirname}/${serverHost}${url}/index.json`, "utf8", (error, data) => {
    if (error) {
      fs.mkdirsSync(`${__dirname}/${serverHost}${url}/`);
      data = "[]";
    }
    let caches = JSON.parse(data);
    const cacheFileName = zeroPadding(caches.length + 1, 4);
    caches.push({ requestBody: postData, responseFile: cacheFileName });

    console.log("Save cache", url, cacheFileName);
    fs.writeFile(`${__dirname}/${serverHost}${url}/index.json`, JSON.stringify(caches));
    fs.writeFile(`${__dirname}/${serverHost}${url}/${cacheFileName}`, JSON.stringify(response));
  });
};

const getResponseFromServer = async (url, postData, headers) => {
  console.log("Request to server");
  headers.host = serverHost;
  const options = {
    url: `https://${serverHost}${url}`,
    method: "POST",
    headers: headers,
    jar: false
  };
  if (postData.length > 0) options.body = postData;
  return new Promise(resolve => {
    request(options, (error, response, body) => {
      if (response && response.statusCode != 200)
        console.log(response.statusCode, response.headers.location);
      resolve(response);
    });
  });
};

const getResponseFromCache = (url, cacheFileName) => {
  console.log("Response from cache", url, cacheFileName);
  const response = fs.readFileSync(`${__dirname}/${serverHost}${url}/${cacheFileName}`);

  return JSON.parse(response);
};

const checkCache = (url, postData) => {
  try {
    const cachesData = fs.readFileSync(`${__dirname}/${serverHost}${url}/index.json`, "utf8");
    let caches = JSON.parse(cachesData);
    const cacheInfo = caches.find(cache => cache.requestBody == postData);

    if (cacheInfo) return { existsCache: true, cacheFile: cacheInfo.responseFile };
    return { existsCache: false, cacheFile: "" };
  } catch (error) {
    return { existsCache: false, cacheFile: "" };
  }
};

server.on("request", (request, response) => {
  let { headers, url } = request;
  url = replaceFolderName(url);
  let postData = [];

  request.on("data", chunk => {
    postData.push(chunk);
  });

  request.on("end", async () => {
    const postDataString = Buffer.concat(postData).toString();
    console.log("\n", url);

    let res;
    const { existsCache, cacheFile } = checkCache(url, postDataString);
    if (existsCache) {
      res = getResponseFromCache(url, cacheFile);
    } else {
      res = await getResponseFromServer(url, Buffer.concat(postData), headers);
      if (res && res.statusCode == 200) saveCache(url, postDataString, res);
    }

    response.writeHead(200, res.headers);
    response.write(res.body);
    response.end();
  });
});

server.listen(3000);
