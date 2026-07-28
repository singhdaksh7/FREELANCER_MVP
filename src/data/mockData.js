// Mock Data for Project Vault UI Design V1.0

export const CURRENT_USER = {
  id: 'usr_arjun',
  name: 'Arjun Raj',
  email: 'arjun@example.com',
  role: 'Creative Freelancer',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256',
  totalEarnings: 185000,
  pendingEarnings: 50000,
  completedProjects: 14,
  activeClients: 8,
};

export const INITIAL_CLIENTS = [
  { id: 'cli_rohit', name: 'Rohit Sharma', email: 'rohit@designtech.io', company: 'DesignTech Ltd', activeWorkspaces: 2, totalSpent: 75000, status: 'Active' },
  { id: 'cli_priya', name: 'Priya Verma', email: 'priya@fashioncraft.com', company: 'FashionCraft', activeWorkspaces: 1, totalSpent: 45000, status: 'Active' },
  { id: 'cli_karan', name: 'Karan Mehta', email: 'karan@mehtadining.in', company: 'Mehta Hospitality', activeWorkspaces: 1, totalSpent: 30000, status: 'Active' },
  { id: 'cli_ananya', name: 'Ananya Kapoor', email: 'ananya@luxeliving.co', company: 'Luxe Living', activeWorkspaces: 0, totalSpent: 35000, status: 'Inactive' },
];

export const INITIAL_WORKSPACES = [
  {
    id: 'ws_brand_identity',
    title: 'Brand Identity Design',
    secureToken: 'sec_tok_brand_identity_99',
    client: INITIAL_CLIENTS[0],
    category: 'Branding & Graphics',
    description: 'Complete brand guidelines, logotype variations, color palette system, and social media assets.',
    amount: 25000,
    status: 'In Review', // Draft | Preview Processing | In Review | Changes Requested | Approved | Payment Pending | Paid | Files Unlocked | Delivered
    createdAt: '2026-07-20',
    updatedAt: '2026-07-28',
    watermarkText: 'PREVIEW - PROPERTY OF ARJUN RAJ',
    currentVersion: 'v2',
    versions: ['v1', 'v2'],
    files: [
      {
        id: 'file_1',
        name: 'Brand_Guidelines_V2.pdf',
        size: '18.4 MB',
        type: 'application/pdf',
        previewUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1000',
        originalUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        isLocked: true,
        watermarked: true,
        versions: {
          v1: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=1000',
          v2: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1000'
        }
      },
      {
        id: 'file_2',
        name: 'Primary_Logo_Package.zip',
        size: '42.1 MB',
        type: 'application/zip',
        previewUrl: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&q=80&w=1000',
        originalUrl: '#',
        isLocked: true,
        watermarked: true,
        versions: {
          v1: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&q=80&w=1000',
          v2: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&q=80&w=1000'
        }
      },
      {
        id: 'file_3',
        name: 'Social_Media_Kit_1080x1080.fig',
        size: '8.2 MB',
        type: 'application/figma',
        previewUrl: 'https://images.unsplash.com/photo-1542744094-3a317272018a?auto=format&fit=crop&q=80&w=1000',
        originalUrl: '#',
        isLocked: true,
        watermarked: true,
        versions: {
          v1: 'https://images.unsplash.com/photo-1542744094-3a317272018a?auto=format&fit=crop&q=80&w=1000',
          v2: 'https://images.unsplash.com/photo-1542744094-3a317272018a?auto=format&fit=crop&q=80&w=1000'
        }
      }
    ],
    comments: [
      {
        id: 'c_1',
        author: 'Rohit Sharma',
        role: 'Client',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=128',
        timestamp: '2 hours ago',
        text: 'Could we adjust the primary blue hex to match our legacy brand color #1D4ED8 on slide 4?',
        fileId: 'file_1',
        version: 'v1',
        status: 'Resolved', // Open | Resolved
        replies: [
          {
            id: 'c_1_r1',
            author: 'Arjun Raj',
            role: 'Creator',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=128',
            timestamp: '1 hour ago',
            text: 'Updated in V2! Please take a look at the revised guidelines file.'
          }
        ]
      },
      {
        id: 'c_2',
        author: 'Rohit Sharma',
        role: 'Client',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=128',
        timestamp: '30 mins ago',
        text: 'The new logo variation in V2 looks stunning! Ready to approve once final payment is processed.',
        fileId: 'file_1',
        version: 'v2',
        status: 'Open',
        replies: []
      }
    ],
    activityLog: [
      { id: 'act_1', action: 'Workspace Created', user: 'Arjun Raj', timestamp: '2026-07-20 10:30 AM' },
      { id: 'act_2', action: 'Payment Gated Link Generated (₹25,000)', user: 'Arjun Raj', timestamp: '2026-07-20 10:35 AM' },
      { id: 'act_3', action: 'Client Opened Review Link', user: 'Rohit Sharma', timestamp: '2026-07-21 02:15 PM' },
      { id: 'act_4', action: 'Changes Requested (V1)', user: 'Rohit Sharma', timestamp: '2026-07-22 11:00 AM' },
      { id: 'act_5', action: 'Uploaded Version 2 Files', user: 'Arjun Raj', timestamp: '2026-07-28 08:30 AM' }
    ]
  },
  {
    id: 'ws_ecommerce_ui',
    title: 'E-commerce Website UI',
    secureToken: 'sec_tok_ecommerce_88',
    client: INITIAL_CLIENTS[1],
    category: 'Web Design',
    description: 'High-fidelity Figma wireframes and mobile responsive design system for online apparel store.',
    amount: 45000,
    status: 'Approved',
    createdAt: '2026-07-15',
    updatedAt: '2026-07-27',
    watermarkText: 'PREVIEW - FASHIONCRAFT UI',
    currentVersion: 'v1',
    versions: ['v1'],
    files: [
      {
        id: 'file_e1',
        name: 'Storefront_HighFi_UI.fig',
        size: '35.2 MB',
        type: 'application/figma',
        previewUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1000',
        originalUrl: '#',
        isLocked: true,
        watermarked: true
      }
    ],
    comments: [],
    activityLog: [
      { id: 'act_e1', action: 'Workspace Created', user: 'Arjun Raj', timestamp: '2026-07-15 09:00 AM' },
      { id: 'act_e2', action: 'Client Approved Work', user: 'Priya Verma', timestamp: '2026-07-27 04:20 PM' }
    ]
  },
  {
    id: 'ws_product_pkg',
    title: 'Product Packaging Design',
    secureToken: 'sec_tok_packaging_77',
    client: INITIAL_CLIENTS[2],
    category: 'Packaging',
    description: '3D Render mockups and print-ready die-cut vector files for organic coffee box.',
    amount: 30000,
    status: 'Paid',
    createdAt: '2026-07-02',
    updatedAt: '2026-07-18',
    watermarkText: 'UNLOCKED ORIGINAL',
    currentVersion: 'v1',
    versions: ['v1'],
    files: [
      {
        id: 'file_p1',
        name: 'CoffeeBox_PrintReady_DieCut.ai',
        size: '64.0 MB',
        type: 'application/illustrator',
        previewUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=1000',
        originalUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        isLocked: false,
        watermarked: false
      }
    ],
    comments: [],
    activityLog: [
      { id: 'act_p1', action: 'Workspace Created', user: 'Arjun Raj', timestamp: '2026-07-02 02:00 PM' },
      { id: 'act_p2', action: 'Payment Received (₹30,000)', user: 'Razorpay System', timestamp: '2026-07-18 03:45 PM' },
      { id: 'act_p3', action: 'Files Unlocked for Download', user: 'System', timestamp: '2026-07-18 03:45 PM' }
    ]
  }
];

export const MOCK_NOTIFICATIONS = [
  { id: 'notif_1', title: 'New Comment on Brand Identity Design', text: 'Rohit Sharma commented on slide 4.', time: '30 mins ago', read: false, type: 'comment' },
  { id: 'notif_2', title: 'Work Approved by Priya Verma', text: 'E-commerce Website UI was approved. Payment pending.', time: '1 day ago', read: false, type: 'approval' },
  { id: 'notif_3', title: 'Payment Received ₹30,000', text: 'Payment for Product Packaging Design has succeeded.', time: '10 days ago', read: true, type: 'payment' },
  { id: 'notif_4', title: 'Client Viewed Secure Link', text: 'Rohit Sharma opened sec_tok_brand_identity_99', time: '1 week ago', read: true, type: 'view' }
];

export const MOCK_PAYMENTS = [
  { id: 'pay_101', workspaceTitle: 'Product Packaging Design', clientName: 'Karan Mehta', amount: 30000, fee: 750, netAmount: 29250, date: '2026-07-18', status: 'Completed', paymentMethod: 'UPI (GPay)' },
  { id: 'pay_102', workspaceTitle: 'E-commerce Website UI', clientName: 'Priya Verma', amount: 45000, fee: 1125, netAmount: 43875, date: 'Pending', status: 'Pending Approval', paymentMethod: 'Card / NetBanking' },
  { id: 'pay_103', workspaceTitle: 'Brand Identity Design', clientName: 'Rohit Sharma', amount: 25000, fee: 625, netAmount: 24375, date: 'Pending', status: 'In Review', paymentMethod: 'UPI / Card' }
];

export const MOCK_ADMIN_DATA = {
  users: [
    { id: 'usr_arjun', name: 'Arjun Raj', email: 'arjun@example.com', role: 'Creator', status: 'Active', plan: 'Pro', workspacesCount: 3, joinedDate: '2026-01-10' },
    { id: 'usr_rohit', name: 'Rohit Sharma', email: 'rohit@designtech.io', role: 'Client', status: 'Active', plan: 'N/A', workspacesCount: 2, joinedDate: '2026-03-12' },
    { id: 'usr_priya', name: 'Priya Verma', email: 'priya@fashioncraft.com', role: 'Client', status: 'Active', plan: 'N/A', workspacesCount: 1, joinedDate: '2026-05-04' }
  ],
  webhooks: [
    { id: 'wh_1', event: 'payment.captured', url: 'https://api.projectvault.app/webhooks/razorpay', status: 'Active', lastTriggered: '2026-07-18 15:45' },
    { id: 'wh_2', event: 'workspace.unlocked', url: 'https://api.projectvault.app/webhooks/deliveries', status: 'Active', lastTriggered: '2026-07-18 15:45' }
  ],
  storage: {
    totalUsedGB: 142.8,
    totalQuotaGB: 1000,
    activeWatermarkedPreviews: 48,
    lockedOriginalFiles: 18
  }
};
