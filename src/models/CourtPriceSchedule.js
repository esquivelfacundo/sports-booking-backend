module.exports = (sequelize, DataTypes) => {
  const CourtPriceSchedule = sequelize.define('CourtPriceSchedule', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    courtId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'courts',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Nombre de la franja horaria, ej: "Horario Diurno", "Horario Nocturno"'
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
      comment: 'Hora de inicio de la franja, ej: 08:00'
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
      comment: 'Hora de fin de la franja, ej: 18:00'
    },
    pricePerHour: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Precio por hora para esta franja'
    },
    daysOfWeek: {
      type: DataTypes.JSON,
      defaultValue: [0, 1, 2, 3, 4, 5, 6],
      comment: 'Días de la semana en que aplica (0=domingo, 6=sábado). Default: todos los días'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Prioridad para resolver conflictos de horarios solapados (mayor = más prioritario)'
    }
  }, {
    tableName: 'court_price_schedules',
    timestamps: true,
    indexes: [
      {
        fields: ['courtId']
      },
      {
        fields: ['startTime', 'endTime']
      },
      {
        fields: ['isActive']
      }
    ]
  });

  return CourtPriceSchedule;
};
