const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 9000;

// MiddleWare
app.use(cors());
app.use(express.json());

const verifyToken = (req, res, next) => {
  // console.log("inside verify token", req.headers);
  if (!req.headers.authorization) {
    return res.status(404).send({ message: "Permission token not Found" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fgalepw.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const reviewsCollection = client.db("bistroDB").collection("reviews");
    const menuCollection = client.db("bistroDB").collection("menu");
    const cartCollection = client.db("bistroDB").collection("carts");
    const userCollection = client.db("bistroDB").collection("users");
    const paymentCollection = client.db("bistroDB").collection("payments");

    // jwt related api
    app.post("/api/v1/jwt", async (req, res) => {
      const user = req.body;
      // console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res.send({ token });
    });
    // use verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded?.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // User Related Api
    app.get("/api/v1/users", verifyToken, verifyAdmin, async (req, res) => {
      // console.log(req.headers);
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //todo Admin verify
    app.get("/api/v1/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params?.email;
      // console.log(email, req.decoded?.email);
      if (email !== req.decoded?.email) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      // console.log(admin);
      res.send({ admin });
    });

    app.patch(
      "/api/v1/users/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = {
          _id: new ObjectId(id),
        };

        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);

        res.send(result);
      }
    );

    app.post("/api/v1/users", async (req, res) => {
      const user = req.body;

      const query = { email: user.email };
      const isUserExits = await userCollection.findOne(query);
      if (isUserExits) {
        return res.send({ message: "Old user", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.delete(
      "/api/v1/users/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = {
          _id: new ObjectId(id),
        };
        const result = await userCollection.deleteOne(query);
        res.send(result);
      }
    );

    //  Review Related Api
    app.get("/api/v1/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    //  Menu Related Api
    app.get("/api/v1/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.get("/api/v1/menu/:id", async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const query = { _id: id };
      const result = await menuCollection.findOne(query);
      res.send(result);
    });

    app.patch("/api/v1/menu/:id", async (req, res) => {
      const id = req.params.id;
      const item = req.body;
      // console.log(id, menuItem);
      const filter = { _id: id };
      const updatedDoc = {
        $set: {
          name: item.name,
          price: item.price,
          category: item.category,
          recipe: item.recipe,
          image: item.image,
        },
      };
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.post("/api/v1/menu", verifyToken, verifyAdmin, async (req, res) => {
      const menuItem = req.body;
      const result = await menuCollection.insertOne(menuItem);
      res.send(result);
    });

    app.delete(
      "/api/v1/menu/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: id };
        const result = await menuCollection.deleteOne(query);
        res.send(result);
      }
    );

    //  Carts Collection
    app.get("/api/v1/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/api/v1/carts", async (req, res) => {
      const cart = req.body;
      // console.log(cart);
      const result = await cartCollection.insertOne(cart);
      res.send(result);
    });

    app.delete("/api/v1/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);

      res.send(result);
    });

    // Payment Intent (Stripe)
    app.post("/api/v1/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      // console.log(price);
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    //payments related api
    app.get("/api/v1/payments/:email", verifyToken, async (req, res) => {
      const email = req.params?.email;
      // console.log(email);
      if (req.params?.email !== req.decoded?.email) {
        res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/api/v1/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      //carefully delete each cart item from cart
      // console.log("payment info", payment);
      const query = {
        _id: {
          $in: payment?.cartIds?.map((id) => new ObjectId(id)),
        },
      };
      const deleteResult = await cartCollection.deleteMany(query);
      res.send({ paymentResult, deleteResult });
    });

    // Admin stats related api
    app.get(
      "/api/v1/admin-stats",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const user = await userCollection.estimatedDocumentCount();
        const menuItems = await menuCollection.estimatedDocumentCount();
        const orders = await paymentCollection.estimatedDocumentCount();

        // this is not the best way
        // const payments = await paymentCollection.find().toArray();
        // const revenue = await payments.reduce(
        //   (total, payment) => total + payment.price,
        //   0
        // );
        const result = await paymentCollection
          .aggregate([
            {
              $group: {
                _id: null,
                revenue: {
                  $sum: "$total",
                },
              },
            },
          ])
          .toArray();
        const revenue = result.length > 0 ? result[0].revenue : 0;

        res.send({
          user,
          menuItems,
          orders,
          revenue,
        });
      }
    );

    // Order stats
    app.get(
      "/api/v1/order-stats",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const result = await paymentCollection
          .aggregate([
            {
              $unwind: "$menuItemIds",
            },
            {
              $lookup: {
                from: "menu",
                localField: "menuItemIds",
                foreignField: "_id",
                as: "menuItems",
              },
            },
            {
              $unwind: "$menuItems",
            },
            {
              $group: {
                _id: "$menuItems.category",
                quantity: { $sum: 1 },
                revenue: {
                  $sum: "$menuItems.price",
                },
              },
            },
          ])
          .toArray();
        res.send(result);
      }
    );

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Bistro Boss is Running");
});
app.listen(port, () => {
  console.log("Bistro Boss Server is running on Port:", port);
});
