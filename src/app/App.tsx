import React, { useEffect, useState, useMemo } from 'react';
import {
  ConfigProvider,
  App as AntdApp,
  Layout,
  Typography,
  Button,
  Card,
  Row,
  Col,
  Statistic,
  Input,
  Modal,
  Drawer,
  Form,
  InputNumber,
  Select,
  Radio,
  Space,
  Popconfirm,
  Grid,
  Spin,
  message,
} from 'antd';
import {
  PlusOutlined,
  DollarCircleOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SearchOutlined,
  ThunderboltFilled,
  CheckCircleFilled,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import BigNumber from 'bignumber.js';
import confetti from 'canvas-confetti';
import { db } from '../services/db';
import { seedInitialDataIfEmpty } from '../services/dbSeed';
import { cleanFinanceMintTheme } from '../theme';
import { formatMoney } from '../utils/currency';
import { calculateSimplifiedDebts } from '../utils/debtEngine';
import { computeSplits } from '../utils/splitEngine';
import { useAppStore } from '../stores/useAppStore';
import type { UserProfile, UUID, SplitType, ExpenseCategory } from '../types';

const { Header, Content } = Layout;
const { useBreakpoint } = Grid;

const CATEGORIES: { label: string; value: ExpenseCategory }[] = [
  { label: 'Food & Dining', value: 'FOOD_AND_DRINK' },
  { label: 'Transportation', value: 'TRANSPORTATION' },
  { label: 'Groceries', value: 'GROCERIES' },
  { label: 'Home & Utilities', value: 'HOME_UTILITIES' },
  { label: 'Lodging', value: 'LODGING' },
  { label: 'Entertainment', value: 'ENTERTAINMENT' },
  { label: 'Services', value: 'SERVICES' },
  { label: 'General', value: 'GENERAL' },
];

export const AppContent: React.FC = () => {
  const [initialized, setInitialized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const {
    currentUserId,
    isExpenseModalOpen,
    isSettlementModalOpen,
    preselectedSettlementTarget,
    openExpenseModal,
    closeExpenseModal,
    openSettlementModal,
    closeSettlementModal,
  } = useAppStore();

  const [form] = Form.useForm();
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expensePayerId, setExpensePayerId] = useState<UUID>(currentUserId);
  const [expenseSplitType, setExpenseSplitType] = useState<SplitType>('EQUAL');

  const [settlePayerId, setSettlePayerId] = useState<UUID>(currentUserId);
  const [settleReceiverId, setSettleReceiverId] = useState<UUID>('');
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [submittingSettle, setSubmittingSettle] = useState(false);

  useEffect(() => {
    seedInitialDataIfEmpty().then(() => setInitialized(true));
  }, []);

  const users = useLiveQuery(() => db.users.toArray(), []) || [];
  const groups = useLiveQuery(() => db.groups.toArray(), []) || [];
  const expenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray(), []) || [];

  const membersMap = useMemo(() => {
    const map = new Map<UUID, UserProfile>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  useEffect(() => {
    if (users.length > 0 && !settleReceiverId) {
      const other = users.find((u) => u.id !== currentUserId);
      if (other) setSettleReceiverId(other.id);
    }
  }, [users, currentUserId, settleReceiverId]);

  useEffect(() => {
    if (preselectedSettlementTarget) {
      setSettlePayerId(preselectedSettlementTarget.fromUserId);
      setSettleReceiverId(preselectedSettlementTarget.toUserId);
      setSettleAmount(preselectedSettlementTarget.amount);
    }
  }, [preselectedSettlementTarget]);

  const { totalOwedToMe, totalIOwe, netBalance } = useMemo(() => {
    let credit = new BigNumber(0);
    let debit = new BigNumber(0);

    for (const exp of expenses) {
      const myPayment = exp.paidBy.find((p) => p.userId === currentUserId)?.amountPaid || 0;
      const mySplit = exp.splits.find((s) => s.userId === currentUserId)?.owedAmount || 0;
      const diff = new BigNumber(myPayment).minus(mySplit);

      if (diff.isGreaterThan(0)) {
        credit = credit.plus(diff);
      } else if (diff.isLessThan(0)) {
        debit = debit.plus(diff.abs());
      }
    }

    return {
      totalOwedToMe: credit.toNumber(),
      totalIOwe: debit.toNumber(),
      netBalance: credit.minus(debit).toNumber(),
    };
  }, [expenses, currentUserId]);

  const allUserIds = useMemo(() => users.map((u) => u.id), [users]);
  const simplifiedTransfers = useMemo(() => {
    return calculateSimplifiedDebts(allUserIds, expenses, 'USD');
  }, [allUserIds, expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) =>
      e.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [expenses, searchQuery]);

  if (!initialized) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  const handleDeleteExpense = async (id: string) => {
    await db.transaction('rw', db.expenses, db.activities, async () => {
      await db.expenses.delete(id);
      await db.activities.add({
        id: `act-${Date.now()}`,
        actorUserId: currentUserId,
        action: 'EXPENSE_DELETED',
        entityId: id,
        metadata: {},
        timestamp: new Date().toISOString(),
      });
    });
    message.success('Expense removed');
  };

  const handleCreateExpense = async () => {
    try {
      const values = await form.validateFields();
      if (expenseAmount <= 0) {
        message.error('Expense amount must be positive');
        return;
      }

      const participantIds = users.map((u) => u.id);
      const splitResult = computeSplits({
        totalAmount: expenseAmount,
        splitType: expenseSplitType,
        participantIds,
      });

      if (!splitResult.isValid) {
        message.error(splitResult.validationError || 'Invalid split allocation');
        return;
      }

      setSubmittingExpense(true);
      const now = new Date().toISOString();
      const expenseId = `exp-${Date.now()}`;

      await db.transaction('rw', db.expenses, db.activities, async () => {
        await db.expenses.add({
          id: expenseId,
          groupId: values.groupId === 'NONE' ? null : values.groupId,
          description: values.description,
          category: values.category,
          amount: expenseAmount,
          currency: 'USD',
          paidBy: [{ userId: expensePayerId, amountPaid: expenseAmount }],
          splitType: expenseSplitType,
          splits: splitResult.splits,
          date: now,
          isSettlement: false,
          createdBy: currentUserId,
          createdAt: now,
          updatedAt: now,
        });

        await db.activities.add({
          id: `act-${Date.now()}`,
          groupId: values.groupId === 'NONE' ? undefined : values.groupId,
          actorUserId: currentUserId,
          action: 'EXPENSE_CREATED',
          entityId: expenseId,
          metadata: { description: values.description, amount: expenseAmount, currency: 'USD' },
          timestamp: now,
        });
      });

      message.success('Expense saved');
      form.resetFields();
      setExpenseAmount(0);
      closeExpenseModal();
    } catch {
      // Form validation error caught by AntD
    } finally {
      setSubmittingExpense(false);
    }
  };

  const handleRecordSettlement = async () => {
    if (settlePayerId === settleReceiverId) {
      message.error('Payer and recipient cannot be the same');
      return;
    }
    if (settleAmount <= 0) {
      message.error('Please enter a valid payment amount');
      return;
    }

    setSubmittingSettle(true);
    const now = new Date().toISOString();
    const settlementId = `settle-${Date.now()}`;

    await db.transaction('rw', db.expenses, db.activities, async () => {
      await db.expenses.add({
        id: settlementId,
        groupId: null,
        description: 'Settlement Payment',
        category: 'GENERAL',
        amount: settleAmount,
        currency: 'USD',
        paidBy: [{ userId: settlePayerId, amountPaid: settleAmount }],
        splitType: 'EXACT',
        splits: [{ userId: settleReceiverId, owedAmount: settleAmount }],
        date: now,
        isSettlement: true,
        createdBy: settlePayerId,
        createdAt: now,
        updatedAt: now,
      });

      await db.activities.add({
        id: `act-${Date.now()}`,
        actorUserId: settlePayerId,
        action: 'SETTLEMENT_RECORDED',
        entityId: settlementId,
        metadata: { description: 'Payment recorded', amount: settleAmount, currency: 'USD' },
        timestamp: now,
      });
    });

    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#00A86B', '#10B981', '#34D399'],
    });

    message.success('Payment recorded');
    setSubmittingSettle(false);
    closeSettlementModal();
  };

  const expenseFormJSX = (
    <Form form={form} layout="vertical" initialValues={{ category: 'FOOD_AND_DRINK', groupId: 'NONE' }}>
      <Form.Item name="description" label="Description" rules={[{ required: true, message: 'Required' }]}>
        <Input placeholder="e.g. Dinner, Groceries, Flight" size="large" />
      </Form.Item>

      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="Amount ($)" required>
            <InputNumber
              min={0.01}
              step={0.5}
              value={expenseAmount}
              onChange={(v) => setExpenseAmount(v ?? 0)}
              style={{ width: '100%' }}
              size="large"
              placeholder="0.00"
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="category" label="Category">
            <Select options={CATEGORIES} size="large" />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="groupId" label="Assign to Group">
        <Select
          options={[
            { label: 'None (Direct split with all)', value: 'NONE' },
            ...groups.map((g) => ({ label: g.name, value: g.id })),
          ]}
        />
      </Form.Item>

      <Form.Item label="Paid by">
        <Select
          value={expensePayerId}
          onChange={(v) => setExpensePayerId(v)}
          options={users.map((u) => ({ label: u.name, value: u.id }))}
        />
      </Form.Item>

      <Form.Item label="Split Method">
        <Radio.Group
          value={expenseSplitType}
          onChange={(e) => setExpenseSplitType(e.target.value)}
          buttonStyle="solid"
        >
          <Radio.Button value="EQUAL">Equally</Radio.Button>
        </Radio.Group>
      </Form.Item>
    </Form>
  );

  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      <Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          padding: isMobile ? '0 12px' : '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 60,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: '#00A86B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: 18,
            }}
          >
            S
          </div>
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 700 }}>
            Mint<span style={{ color: '#00A86B' }}>Split</span>
          </Typography.Title>
        </div>

        <Space size="small">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openExpenseModal}
            style={{ backgroundColor: '#00A86B', fontWeight: 600, minHeight: 38 }}
          >
            {!isMobile && 'Add Expense'}
          </Button>
          <Button
            icon={<DollarCircleOutlined />}
            onClick={() => openSettlementModal()}
            style={{ minHeight: 38 }}
          >
            {!isMobile && 'Settle'}
          </Button>
        </Space>
      </Header>

      <Content style={{ padding: isMobile ? '16px 12px 76px 12px' : '24px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card style={{ borderRadius: 12, border: '1px solid #E2E8F0' }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Net Balance
              </Typography.Text>
              <Typography.Title
                level={2}
                style={{
                  margin: '4px 0 0 0',
                  color: netBalance > 0.005 ? '#059669' : netBalance < -0.005 ? '#E11D48' : '#0F172A',
                }}
              >
                {netBalance > 0 ? '+' : ''}{formatMoney(netBalance, 'USD')}
              </Typography.Title>
            </Card>
          </Col>
          <Col xs={12} sm={8}>
            <Card style={{ borderRadius: 12, border: '1px solid #E2E8F0' }}>
              <Statistic
                title="You are owed"
                value={totalOwedToMe}
                precision={2}
                prefix={<ArrowUpOutlined style={{ fontSize: 16 }} />}
                valueStyle={{ color: '#059669', fontWeight: 700 }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8}>
            <Card style={{ borderRadius: 12, border: '1px solid #E2E8F0' }}>
              <Statistic
                title="You owe"
                value={totalIOwe}
                precision={2}
                prefix={<ArrowDownOutlined style={{ fontSize: 16 }} />}
                valueStyle={{ color: '#E11D48', fontWeight: 700 }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[20, 20]} style={{ marginTop: 20 }}>
          <Col xs={24} lg={15}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                Expenses
              </Typography.Title>
              <Input
                placeholder="Search..."
                prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 160, borderRadius: 8 }}
                allowClear
              />
            </div>

            {filteredExpenses.length === 0 ? (
              <Card style={{ textAlign: 'center', padding: '32px 0', borderRadius: 12 }}>
                <Typography.Text type="secondary">No recorded expenses.</Typography.Text>
              </Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredExpenses.map((expense) => {
                  const payer = membersMap.get(expense.paidBy[0]?.userId);
                  const isSettlement = expense.isSettlement;

                  return (
                    <Card
                      key={expense.id}
                      styles={{ body: { padding: '12px 16px' } }}
                      style={{
                        borderRadius: 10,
                        border: '1px solid #EDF2F7',
                        backgroundColor: isSettlement ? '#F0FDF4' : '#FFFFFF',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <Typography.Text strong style={{ fontSize: 15 }}>
                            {expense.description}
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                            {new Date(expense.date).toLocaleDateString()} • Paid by {payer?.name || 'Someone'}
                          </Typography.Text>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Typography.Text strong style={{ fontSize: 16 }}>
                            {formatMoney(expense.amount, expense.currency)}
                          </Typography.Text>
                          <Popconfirm
                            title="Delete this entry?"
                            onConfirm={() => handleDeleteExpense(expense.id)}
                            okText="Delete"
                            cancelText="Cancel"
                            okButtonProps={{ danger: true }}
                          >
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              aria-label="Delete Entry"
                              style={{ width: 44, height: 44, minHeight: 44 }}
                            />
                          </Popconfirm>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Col>

          <Col xs={24} lg={9}>
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ThunderboltFilled style={{ color: '#00A86B' }} />
                  <span>Simplified Settlements</span>
                </div>
              }
              style={{ borderRadius: 12, border: '1px solid #E2E8F0' }}
            >
              {simplifiedTransfers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 8px' }}>
                  <CheckCircleFilled style={{ fontSize: 32, color: '#00A86B', marginBottom: 8 }} />
                  <Typography.Text strong style={{ display: 'block', color: '#065F46' }}>
                    All settled up!
                  </Typography.Text>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {simplifiedTransfers.map((t, idx) => {
                    const fromUser = membersMap.get(t.fromUserId);
                    const toUser = membersMap.get(t.toUserId);
                    const involvesMe = t.fromUserId === currentUserId || t.toUserId === currentUserId;

                    return (
                      <div
                        key={`${t.fromUserId}-${t.toUserId}-${idx}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: 8,
                          backgroundColor: involvesMe ? '#F0FDF7' : '#F8FAFC',
                          border: '1px solid',
                          borderColor: involvesMe ? '#A7F3D0' : '#E2E8F0',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <Typography.Text strong ellipsis style={{ fontSize: 13, maxWidth: 70 }}>
                            {t.fromUserId === currentUserId ? 'You' : fromUser?.name.split(' ')[0]}
                          </Typography.Text>
                          <ArrowRightOutlined style={{ color: '#94A3B8', fontSize: 12 }} />
                          <Typography.Text strong ellipsis style={{ fontSize: 13, maxWidth: 70 }}>
                            {t.toUserId === currentUserId ? 'You' : toUser?.name.split(' ')[0]}
                          </Typography.Text>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Typography.Text strong style={{ fontSize: 13 }}>
                            {formatMoney(t.amount, t.currency)}
                          </Typography.Text>
                          {involvesMe && (
                            <Button
                              type="primary"
                              size="small"
                              style={{ backgroundColor: '#00A86B', minHeight: 30 }}
                              onClick={() =>
                                openSettlementModal({
                                  fromUserId: t.fromUserId,
                                  toUserId: t.toUserId,
                                  amount: t.amount,
                                })
                              }
                            >
                              Settle
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </Content>

      {/* Add Expense Modal / Mobile Drawer */}
      {isMobile ? (
        <Drawer
          title="Add an Expense"
          placement="bottom"
          open={isExpenseModalOpen}
          onClose={closeExpenseModal}
          height="88vh"
          extra={
            <Button
              type="primary"
              onClick={handleCreateExpense}
              loading={submittingExpense}
              disabled={submittingExpense}
              style={{ backgroundColor: '#00A86B', minHeight: 38 }}
            >
              Save
            </Button>
          }
        >
          {expenseFormJSX}
        </Drawer>
      ) : (
        <Modal
          title="Add an Expense"
          open={isExpenseModalOpen}
          onCancel={closeExpenseModal}
          onOk={handleCreateExpense}
          confirmLoading={submittingExpense}
          okText="Save Expense"
          okButtonProps={{ style: { backgroundColor: '#00A86B' } }}
        >
          {expenseFormJSX}
        </Modal>
      )}

      {/* Settle Up Modal */}
      <Modal
        title="Record a Payment"
        open={isSettlementModalOpen}
        onCancel={closeSettlementModal}
        onOk={handleRecordSettlement}
        confirmLoading={submittingSettle}
        okText="Record Settlement"
        okButtonProps={{ style: { backgroundColor: '#00A86B' } }}
      >
        <Space orientation="vertical" style={{ width: '100%', marginTop: 12 }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Who is paying?
            </Typography.Text>
            <Select
              value={settlePayerId}
              onChange={(v) => setSettlePayerId(v)}
              style={{ width: '100%' }}
              options={users.map((u) => ({ label: u.name, value: u.id }))}
            />
          </div>

          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Who is receiving?
            </Typography.Text>
            <Select
              value={settleReceiverId}
              onChange={(v) => setSettleReceiverId(v)}
              style={{ width: '100%' }}
              options={users.map((u) => ({ label: u.name, value: u.id }))}
            />
          </div>

          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Amount ($)
            </Typography.Text>
            <InputNumber
              value={settleAmount}
              onChange={(v) => setSettleAmount(v ?? 0)}
              prefix="$"
              min={0.01}
              step={1}
              style={{ width: '100%' }}
              size="large"
            />
          </div>
        </Space>
      </Modal>
    </Layout>
  );
};

export const App: React.FC = () => {
  return (
    <ConfigProvider theme={cleanFinanceMintTheme}>
      <AntdApp>
        <AppContent />
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;
