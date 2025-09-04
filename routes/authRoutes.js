const express = require("express");
const { registerUser, loginUser, getUserProfile, updateUserProfile } = require("../controllers/authController")
const { protect } = require("../middlewares/authMiddleware");
const multer = require("multer");
const upload  = require("../middlewares/uploadMiddleware");

const router = express.Router();

// Auth Routes
router.post("/register", registerUser);  // Register user
router.post("/login", loginUser);        // Login user
router.get("/profile", protect, getUserProfile);    // Get User Profile 
router.put("/profile", protect, updateUserProfile); // Update Profile

// check again
// router.post("/upload-image", upload.single("image"), (req, res)=> {
//     if(!req.file){
//         return res.status(400).json({ message: "No file uploaded" });
//     }
//     const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
//     res.status(200).json({ imageUrl });
// });

router.post("/upload-image", (req, res, next) => {
  upload.single("image")(req, res, function (err) {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: err.message });
      } else {
        return res.status(400).json({ message: "File upload failed", error: err.message });
      }
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    res.status(200).json({ imageUrl });
  });
});


module.exports = router;