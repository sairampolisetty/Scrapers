const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

const BASE = "https://www.cardekho.com";
const OUTPUT_FILE = "cardekho-reviews.json";

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ---------------- LOAD EXISTING DATA ---------------- */

let allReviews = [];

if (fs.existsSync(OUTPUT_FILE)) {
  try {
    const existing = fs.readFileSync(OUTPUT_FILE);
    allReviews = JSON.parse(existing);
    console.log("Loaded existing reviews:", allReviews.length);
  } catch {
    console.log("Starting fresh dataset");
  }
}

/* ---------------- CAR LIST ---------------- */

const cars = [

/* MARUTI */
{brand:"maruti-suzuki",model:"alto-k10"},
{brand:"maruti-suzuki",model:"baleno"},
{brand:"maruti-suzuki",model:"brezza"},
{brand:"maruti-suzuki",model:"celerio"},
{brand:"maruti-suzuki",model:"ciaz"},
{brand:"maruti-suzuki",model:"dzire"},
{brand:"maruti-suzuki",model:"ertiga"},
{brand:"maruti-suzuki",model:"fronx"},
{brand:"maruti-suzuki",model:"grand-vitara"},
{brand:"maruti-suzuki",model:"ignis"},
{brand:"maruti-suzuki",model:"jimny"},
{brand:"maruti-suzuki",model:"s-presso"},
{brand:"maruti-suzuki",model:"swift"},
{brand:"maruti-suzuki",model:"wagon-r"},
{brand:"maruti-suzuki",model:"xl6"},
{brand:"maruti-suzuki",model:"invicto"},
{brand:"maruti-suzuki",model:"eeco"},

/* HYUNDAI */
{brand:"hyundai",model:"creta"},
{brand:"hyundai",model:"venue"},
{brand:"hyundai",model:"verna"},
{brand:"hyundai",model:"exter"},
{brand:"hyundai",model:"i20"},
{brand:"hyundai",model:"i20-n-line"},
{brand:"hyundai",model:"alcazar"},
{brand:"hyundai",model:"tucson"},
{brand:"hyundai",model:"kona-electric"},
{brand:"hyundai",model:"ioniq-5"},

/* TATA */
{brand:"tata",model:"nexon"},
{brand:"tata",model:"nexon-ev"},
{brand:"tata",model:"harrier"},
{brand:"tata",model:"safari"},
{brand:"tata",model:"punch"},
{brand:"tata",model:"altroz"},
{brand:"tata",model:"tiago"},
{brand:"tata",model:"tiago-ev"},
{brand:"tata",model:"tigor"},
{brand:"tata",model:"tigor-ev"},

/* MAHINDRA */
{brand:"mahindra",model:"scorpio-n"},
{brand:"mahindra",model:"scorpio-classic"},
{brand:"mahindra",model:"xuv700"},
{brand:"mahindra",model:"xuv300"},
{brand:"mahindra",model:"xuv400"},
{brand:"mahindra",model:"thar"},
{brand:"mahindra",model:"bolero"},
{brand:"mahindra",model:"bolero-neo"},
{brand:"mahindra",model:"marazzo"},

/* KIA */
{brand:"kia",model:"seltos"},
{brand:"kia",model:"sonet"},
{brand:"kia",model:"carens"},
{brand:"kia",model:"ev6"},
{brand:"kia",model:"carnival"},

/* TOYOTA */
{brand:"toyota",model:"fortuner"},
{brand:"toyota",model:"fortuner-legender"},
{brand:"toyota",model:"innova-crysta"},
{brand:"toyota",model:"innova-hycross"},
{brand:"toyota",model:"urban-cruiser-hyryder"},
{brand:"toyota",model:"urban-cruiser-taiser"},
{brand:"toyota",model:"glanza"},
{brand:"toyota",model:"camry"},
{brand:"toyota",model:"vellfire"},
{brand:"toyota",model:"land-cruiser"},

/* HONDA */
{brand:"honda",model:"city"},
{brand:"honda",model:"city-hybrid"},
{brand:"honda",model:"amaze"},
{brand:"honda",model:"elevate"},
{brand:"honda",model:"jazz"},
{brand:"honda",model:"wr-v"},

/* SKODA */
{brand:"skoda",model:"kushaq"},
{brand:"skoda",model:"slavia"},
{brand:"skoda",model:"kodiaq"},
{brand:"skoda",model:"superb"},
{brand:"skoda",model:"octavia"},
{brand:"skoda",model:"rapid"},

/* VOLKSWAGEN */
{brand:"volkswagen",model:"virtus"},
{brand:"volkswagen",model:"taigun"},
{brand:"volkswagen",model:"tiguan"},
{brand:"volkswagen",model:"polo"},
{brand:"volkswagen",model:"vento"},
{brand:"volkswagen",model:"passat"},

/* MG */
{brand:"mg",model:"hector"},
{brand:"mg",model:"hector-plus"},
{brand:"mg",model:"astor"},
{brand:"mg",model:"zs-ev"},
{brand:"mg",model:"comet-ev"},
{brand:"mg",model:"gloster"},

/* RENAULT */
{brand:"renault",model:"kwid"},
{brand:"renault",model:"kiger"},
{brand:"renault",model:"triber"},
{brand:"renault",model:"duster"},

/* NISSAN */
{brand:"nissan",model:"magnite"},
{brand:"nissan",model:"kicks"},
{brand:"nissan",model:"x-trail"},
{brand:"nissan",model:"terrano"},

/* LUXURY */
{brand:"audi",model:"a4"},
{brand:"audi",model:"a6"},
{brand:"audi",model:"a8"},
{brand:"audi",model:"q3"},
{brand:"audi",model:"q5"},
{brand:"audi",model:"q7"},
{brand:"audi",model:"q8"},

{brand:"bmw",model:"2-series"},
{brand:"bmw",model:"3-series"},
{brand:"bmw",model:"5-series"},
{brand:"bmw",model:"7-series"},
{brand:"bmw",model:"x1"},
{brand:"bmw",model:"x3"},
{brand:"bmw",model:"x5"},
{brand:"bmw",model:"x7"},

{brand:"mercedes-benz",model:"a-class"},
{brand:"mercedes-benz",model:"c-class"},
{brand:"mercedes-benz",model:"e-class"},
{brand:"mercedes-benz",model:"s-class"},
{brand:"mercedes-benz",model:"glc"},
{brand:"mercedes-benz",model:"gle"},
{brand:"mercedes-benz",model:"gls"},

{brand:"volvo",model:"xc40"},
{brand:"volvo",model:"xc60"},
{brand:"volvo",model:"xc90"},
{brand:"volvo",model:"s60"},
{brand:"volvo",model:"s90"},

{brand:"lexus",model:"es"},
{brand:"lexus",model:"ls"},
{brand:"lexus",model:"nx"},
{brand:"lexus",model:"rx"},
{brand:"lexus",model:"lx"}

];

/* ---------------- SCRAPER ---------------- */

async function scrapeReviews(car){

  let pageNum = 1;

  while(pageNum <= 10){

    const url =
      pageNum === 1
      ? `${BASE}/${car.brand}/${car.model}/user-reviews`
      : `${BASE}/${car.brand}/${car.model}/user-reviews/${pageNum}`;

    try{

      console.log("Scraping:", url);

      const {data} = await axios.get(url,{
        headers:{
          "User-Agent":"Mozilla/5.0"
        }
      });

      const $ = cheerio.load(data);

      const cards = $(".readReviewBox");

      if(cards.length === 0){
        console.log("No more reviews for", car.model);
        break;
      }

      cards.each((i,el)=>{

        const review =
          $(el).find(".contentheight div").text().trim();

        const rating =
          $(el).find(".ratingStarNew").text().trim();

        if(!review) return;
        if(rating === "0") return;

        allReviews.push({

          car:`${car.brand} ${car.model}`,
          author:$(el).find(".name").text().trim(),
          rating,
          title:$(el).find(".title").text().trim(),
          review,
          url

        });

      });

      pageNum++;

      await sleep(800);

    }catch(e){

      console.log("Stopped:", url);
      break;

    }

  }

  console.log(`${car.brand} ${car.model} finished`);

}

/* ---------------- MAIN ---------------- */

async function start(){

  console.log("Total cars:", cars.length);

  for(const car of cars){

    await scrapeReviews(car);

    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(allReviews,null,2)
    );

    await sleep(1200);

  }

  console.log("Saved reviews:", allReviews.length);

}

start();