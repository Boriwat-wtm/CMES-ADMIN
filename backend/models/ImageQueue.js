import mongoose from 'mongoose';

const imageQueueSchema = new mongoose.Schema({
  // Multi-tenant Identifier
  shopId: {
    type: String,
    required: true,
    index: true
  },

  // Queue Information
  queueNumber: {
    type: Number,
    required: false
  },
  sender: {
    type: String,
    required: true,
    trim: true
  },

  // Content Type & Media
  type: {
    type: String,
    enum: ['image', 'text', 'gift', 'birthday'],
    default: 'image'
  },
  filePath: {
    type: String,
    default: null
  },

  // Text Content
  text: {
    type: String,
    default: null
  },
  textColor: {
    type: String,
    default: 'white'
  },
  socialColor: {
    type: String,
    default: '#ffffff'
  },
  textLayout: {
    type: String,
    enum: ['right', 'left', 'top', 'bottom', 'center'],
    default: 'right'
  },

  // Social Media Info
  socialType: {
    type: String,
    enum: ['ig', 'fb', 'line', 'tiktok', null],
    default: null
  },
  socialName: {
    type: String,
    default: null
  },
  qrCodePath: {
    type: String,
    default: null
  },

  // Duration & Payment (time in seconds)
  time: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },

  // Display Settings
  width: {
    type: Number,
    default: null
  },
  height: {
    type: Number,
    default: null
  },

  // Status Management
  status: {
    type: String,
    enum: ['pending', 'approved', 'playing'],
    default: 'pending'
  },

  // Composition Flag (true if image already has text/social overlay)
  composed: {
    type: Boolean,
    default: false
  },

  // Gift Order Details
  giftOrder: {
    orderId: String,
    tableNumber: String,
    senderPhone: { type: String, default: null },
    items: [{
      id: String,
      name: String,
      quantity: Number,
      price: Number,
      image: String
    }],
    totalPrice: Number,
    note: String
  },

  // User Information
  userId: {
    type: String,
    default: null
  },
  email: {
    type: String,
    default: null
  },
  avatar: {
    type: String,
    default: null
  },

  // Timestamps
  receivedAt: {
    type: Date,
    default: Date.now
  },
  approvedAt: {
    type: Date,
    default: null
  },
  playingAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },

  // Metadata
  metadata: {
    duration: Number,
    social: {
      type: String,
      name: String
    }
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Indexes for better query performance
imageQueueSchema.index({ shopId: 1, status: 1, receivedAt: 1 });
imageQueueSchema.index({ shopId: 1, type: 1, status: 1 });
imageQueueSchema.index({ shopId: 1, userId: 1 });
imageQueueSchema.index({ 'giftOrder.orderId': 1 });
imageQueueSchema.index({ completedAt: 1 });

// Virtual for legacy 'id' field compatibility
imageQueueSchema.virtual('id').get(function () {
  return this._id.toString();
});

// Ensure virtuals are included in JSON
imageQueueSchema.set('toJSON', {
  virtuals: true,
  transform: function (doc, ret) {
    ret.id = ret._id.toString();
    return ret;
  }
});

const ImageQueue = mongoose.model('ImageQueue', imageQueueSchema);

export default ImageQueue;
