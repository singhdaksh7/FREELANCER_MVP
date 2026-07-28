import React, { createContext, useContext, useState } from 'react';
import { CURRENT_USER, INITIAL_CLIENTS, INITIAL_WORKSPACES, MOCK_NOTIFICATIONS, MOCK_PAYMENTS } from '../data/mockData';

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [currentUser] = useState(CURRENT_USER);
  const [clients, setClients] = useState(INITIAL_CLIENTS);
  const [workspaces, setWorkspaces] = useState(INITIAL_WORKSPACES);
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [payments] = useState(MOCK_PAYMENTS);
  const [currentRoute, setCurrentRoute] = useState('/dashboard'); // default starting route
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (message, type = 'info') => {
    setToastMessage({ message, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // State manipulation methods for full interactive journey
  const addWorkspace = (newWorkspace) => {
    setWorkspaces((prev) => [newWorkspace, ...prev]);
    showToast(`Workspace "${newWorkspace.title}" created with ₹${newWorkspace.amount.toLocaleString()} lock!`, 'success');
  };

  const addComment = (workspaceId, commentText, fileId, version) => {
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.id === workspaceId) {
          const newComment = {
            id: `c_${Date.now()}`,
            author: 'Rohit Sharma (Client)',
            role: 'Client',
            avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=128',
            timestamp: 'Just now',
            text: commentText,
            fileId: fileId || ws.files[0]?.id,
            version: version || ws.currentVersion,
            status: 'Open',
            replies: []
          };
          return {
            ...ws,
            comments: [...ws.comments, newComment],
            activityLog: [
              { id: `act_${Date.now()}`, action: `New comment added by Client`, user: 'Rohit Sharma', timestamp: 'Just now' },
              ...ws.activityLog
            ]
          };
        }
        return ws;
      })
    );
    showToast('Comment submitted to Creator!', 'success');
  };

  const resolveComment = (workspaceId, commentId) => {
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.id === workspaceId) {
          return {
            ...ws,
            comments: ws.comments.map((c) => (c.id === commentId ? { ...c, status: 'Resolved' } : c))
          };
        }
        return ws;
      })
    );
    showToast('Comment marked as resolved', 'info');
  };

  const requestChanges = (workspaceId, feedbackText) => {
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.id === workspaceId) {
          return {
            ...ws,
            status: 'Changes Requested',
            activityLog: [
              { id: `act_${Date.now()}`, action: `Changes Requested: "${feedbackText}"`, user: 'Client', timestamp: 'Just now' },
              ...ws.activityLog
            ]
          };
        }
        return ws;
      })
    );
    showToast('Changes requested sent to Arjun Raj', 'warning');
  };

  const uploadNewVersion = (workspaceId, fileObj) => {
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.id === workspaceId) {
          const nextVer = `v${ws.versions.length + 1}`;
          return {
            ...ws,
            currentVersion: nextVer,
            versions: [...ws.versions, nextVer],
            status: 'In Review',
            activityLog: [
              { id: `act_${Date.now()}`, action: `Uploaded ${nextVer} files`, user: 'Arjun Raj', timestamp: 'Just now' },
              ...ws.activityLog
            ]
          };
        }
        return ws;
      })
    );
    showToast('New version V2 successfully uploaded and link updated!', 'success');
  };

  const approveWorkspace = (workspaceId) => {
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.id === workspaceId) {
          return {
            ...ws,
            status: 'Approved',
            activityLog: [
              { id: `act_${Date.now()}`, action: 'Client Approved Work. Ready for payment.', user: 'Client', timestamp: 'Just now' },
              ...ws.activityLog
            ]
          };
        }
        return ws;
      })
    );
    showToast('Workspace approved! Proceeding to Payment Gated Checkout.', 'success');
  };

  const simulatePaymentSuccess = (workspaceId) => {
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.id === workspaceId) {
          return {
            ...ws,
            status: 'Paid',
            files: ws.files.map((f) => ({
              ...f,
              isLocked: false,
              watermarked: false,
              originalUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
            })),
            activityLog: [
              { id: `act_${Date.now()}`, action: `Payment of ₹${ws.amount.toLocaleString()} Received. Files Unlocked!`, user: 'Payment Gateway', timestamp: 'Just now' },
              ...ws.activityLog
            ]
          };
        }
        return ws;
      })
    );
    showToast(`Payment of ₹25,000 received! Original files unlocked.`, 'success');
  };

  const markNotificationRead = (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        clients,
        setClients,
        workspaces,
        notifications,
        payments,
        currentRoute,
        setCurrentRoute,
        toastMessage,
        showToast,
        addWorkspace,
        addComment,
        resolveComment,
        requestChanges,
        uploadNewVersion,
        approveWorkspace,
        simulatePaymentSuccess,
        markNotificationRead
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => useContext(AppContext);
